# PROGRESS — append one entry per completed task (newest last)

Format: `## YYYY-MM-DD T<id> — summary` then **Changed**, **Verified** (test names / screenshot paths), **Needs Harvey's eyes**.

## 2026-11-12 — Handover created
**Changed:** repo scaffold, `src/engine/engine.js` (coast number, projections, fan, solver), 16 unit tests, CI + Pages workflows, schema, edge-function sketch, docs.
**Verified:** `node --test tests/*.test.js` → 16/16 pass.
**Needs Harvey's eyes:** nothing yet.

## 2026-11-13 T2.2 — Onboarding on first launch
**Changed:** `src/onboarding/{questions,answers,state,inputs}.js`, `src/app.js`, `src/ui/format.js`, `src/fx/fallback.js`,
new `index.html` (Slate styles, dark mode, CSP), engine `depletedAt`, `onboarding_answers` table in schema, `docs/ONBOARDING.md`,
generated `docs/QUESTIONS.md`, `tests/onboarding.test.js`, `tests/e2e/onboarding.walk.mjs`.
**Verified:** `npm run check` → 39/39 unit tests. Playwright walk at iPhone 15 size: Quick start (32 questions, sample
answers) → Plan screen; reload resumes on the Plan; no console errors (fonts blocked in the sandbox only); no horizontal
overflow on any screen. Screenshots reviewed: welcome, choice, money, fields, plan, review.
**Needs Harvey's eyes:** everything visual on his iPhone — logic-validated, not device-verified. Especially: month
picker feel on iOS, auto-advance timing on choice questions, the plan screen's wording.

## 2026-11-13 T0.1 — First commit
**Changed:** handover pack committed into `planner/` of the `Forge` repo (D14); H1 rewritten for the subfolder → own-repo split.
**Verified:** `npm run check` → syntax OK, 39/39 unit tests pass; `git check-ignore` confirms `data/seed.local.json` is ignored.
**Needs Harvey's eyes:** nothing.

## 2026-11-13 T0.2 — Playwright at iPhone size
**Changed:** `@playwright/test` devDependency, `playwright.config.js` (iPhone 15 viewport on Chromium, serves the app via
`scripts/serve.mjs` on port 8181, uses the sandbox's pre-installed Chromium when present), `tests/e2e/helpers.js`,
`tests/e2e/smoke.spec.js`, `npm run test:e2e`, CI job `e2e` (installs Chromium, uploads `artifacts/`).
Kept out of `npm run check` on purpose: `check` stays dependency-free and sub-second; CI runs e2e as its own job.
**Verified:** `npm run test:e2e` → 1 passed; `artifacts/smoke-welcome.png` reviewed (welcome screen, no overflow, no console errors).
**Needs Harvey's eyes:** nothing.

## 2026-11-13 T0.3 — Storage interface + LocalStore
**Changed:** `src/data/store.js` — async storage interface (scenarios, monthly snapshots, settings, full backup
export/import, clearAll) and `createLocalStore` (localStorage, every access try/caught, in-memory cache + fallback,
`persistent` flag for the UI warning). Backups include the onboarding answers so export → clear → import restores everything.
`parseBackup` validates before writing (never half-imports). `memoryStorage()` test double.
**Verified:** `tests/store.test.js` (13 tests): empty storage, quota error, storage that throws on every access (iOS private
mode), null storage, corrupt JSON in each key, copy-on-read, persistence across instances, snapshot upsert/sort, export→clear→import,
bad backups rejected with readable errors and nothing written. `npm run check` → 52/52.
**Needs Harvey's eyes:** nothing (no UI yet).

## 2026-11-13 T0.4 — Seed loader (dev only)
**Changed:** `scripts/seed-lib.mjs` (pure `seedToAnswers`), `scripts/seed.mjs` + `npm run seed` → writes
`data/seed.import.local.json` (gitignored), an answers backup the app imports via "Restore answers from a backup".
Only **confirmed** facts are imported; unconfirmed pots and the placeholder assumptions are listed as skipped (names only,
never values) so onboarding asks for them. `build-site.sh` takes an optional output dir and refuses to stage any `data/`,
`seed*.json` or `*.local.json`.
**Verified:** `tests/seed.test.js` (5): confirmed-only mapping, invalid birth/age ignored, output accepted by the app's
`importAnswers`, and a real `build-site.sh` run into a temp dir contains no data/docs/tests/scripts/local JSON.
`npm run seed` against the real seed: 2 answers (base currency, course start Sep 2027); ISA, super, birth, retirement age skipped.
**Needs Harvey's eyes:** your seed file marks the ISA and super balances `confirmed:false` — confirm them in onboarding (q49).

## 2026-11-13 T1.1 — Live FX engine
**Changed:** `src/fx/fx.js` — `createFx({fetch, now, storage})` with `ensure/rates/convert/isLive/ageMs/source`, `pickRates`
validation, `fxBadge` ("rates updated 3h ago" / "approx. offline rates"); `FX_FALLBACK` gains EUR (from legacy). App now
converts with live rates (fallback until fetched), refreshes the plan **in place without replaying the ring** if rates change
after boot, and the assumptions list says which rates were used. CSP allows open.er-api.com; e2e serves a fixed rate table.
**Verified:** `tests/fx.test.js` (11): round-trips equal to 1e-9 for 4 pairs × 4 amounts, legacy maths, unknown currency throws,
payload validation, fallback before any fetch / offline first launch (not persisted), 6 h cache + refresh + force, cache survives
reload, stale-but-real kept when offline, HTTP error/bad JSON/corrupt cache/hostile storage, concurrent calls share one request.
Found and fixed a bug while testing: a cache timestamp of 0 read as "never fetched". Plan screen screenshot `artifacts/onb-5-plan.png`.
**Needs Harvey's eyes:** nothing new visually (one extra line in Assumptions).

## 2026-11-13 T2.2a — Onboarding walk in the Playwright suite
**Changed:** `tests/e2e/onboarding.spec.js` replaces the standalone `onboarding.walk.mjs` (which couldn't find a browser here):
same sample answers, waits on real state changes instead of fixed sleeps, asserts no overflow on every question, Plan after
finishing, resume-to-Plan after reload, Review screen, zero console errors. `walkQuickStart()` is exported for reuse.
CI `e2e` job (T0.2) runs it and uploads `artifacts/` (dormant until the repo split — D14).
**Verified:** `npm run test:e2e` → 2 passed; screenshots `artifacts/onb-1…6`.
**Needs Harvey's eyes:** nothing new.

## 2026-11-13 T1.2 — Multi-pot model with access ages
**Changed:** `src/engine/pots.js` (pot shape, researched default access ages with sources — D17, `accessMonth`, `potsToBase`
FX conversion, `potProblems` validation); `src/engine/dates.js` (shared date helpers, avoids a circular import);
`projectScenario` now runs per-pot balances (own growth rate, per-pot contributions, flow pot, drawdown order, lock respected)
and reports `accessible`/`locked`/`byPot` per row plus `accessibleAtRetirement` and `lockedAtRetirement`;
`scenarioCoastStatus` (coast check with per-pot growth). Onboarding q49 now produces separate pots (cash £, cash A$, ISA,
super with its ATO access age, other). Plan screen: ring uses per-pot growth; "saved now"; warning card when a pot is still
locked after you stop work (e.g. super until 60 when retiring at 55).
**Verified:** `tests/pots.test.js` (15) incl. **a locked £100k super that cannot fund drawdown before 60** (accessible goes
negative, `depletedAt` set, super untouched), unlock → drawn, drawdown order, flow pot, employer contributions, cash 0% real,
coast with mixed growth, UK 55→57 boundary months, ATO table boundaries, conversion, validation. All 68 earlier tests unchanged
(single-pot results bit-identical). e2e walk now enters ISA + super and asserts the locked-super warning. `npm run check` → 83/83.
**Needs Harvey's eyes:** the new "stays locked until Mar 2057" card wording; and note cash now counts as 0% real growth
(see D18) — your plan numbers may look a little worse than before, and more honest.

## 2026-11-13 T1.3 — Life-event library
**Changed:** `src/engine/events.js` — templates `speedbirdPathway` (training → reduced scale for N years → main scale;
salary steps by stage + years-in, one-off/monthly training costs, `replaces` the current job), `child` (age-band costs,
optional school), `houseDeposit` (deposit, buying costs, mortgage), `holiday`, `car` (replacement cycle + running costs),
`oneOffTrip`, `relocation` (moving cost + cost-of-living % on living costs). Pure `applyEvent`, idempotent `expandEvents`
(skips and reports invalid events), `eventProblems` with readable messages, defaults per template. Engine: items can be
switched `off`. Conventions logged in D19.
**Verified:** `tests/events.test.js` (14) — exact net cash flow asserted month by month at every boundary for each template
(e.g. Speedbird: Aug 2027 0 → Sep 2027 training → Mar 2029 reduced scale → Mar 2034 main scale; school stops the month of the
18th birthday; mortgage = exactly 300 payments; cars Mar 2029/2037/2045 then stop at retirement), plus no-invented-salary,
idempotency incl. full undo of patches, invalid-event reporting, engine projection. `npm run check` → 97/97.
**Needs Harvey's eyes:** nothing yet (no UI until T2.6). Bring your Speedbird offer figures when we get to the event editor.

## 2026-11-13 T1.4 — "What must be true" solvers
**Changed:** `src/engine/solve.js` — `bisectMin/bisectMax`, `requiredNominalReturn` (0–20%), `requiredRetirementAge`
(earliest month, integer bisection + verification scan), `affordableRetirementSpend`, `whatMustBeTrue` (all levers; `null` =
not reachable by that lever alone). `projectScenario` now expands `events` itself (idempotent), so every solver includes
life events. Plan screen: the single "invest £X more" callout became an **"Any one of these would get you there"** card
(invest more / stop work at / spend in retirement / returns needed), with unreachable levers in words ("Not enough on its
own", "not even by 80", "even at 20%") and returns above the optimistic 9% flagged as risky. `ageLabel`, `pct` formatters.
**Verified:** `tests/solve.test.js` (8): bisection boundaries + null, affordable spend = closed form pot×rate (+ other income),
required return on track while −0.1% isn't and matches the analytic rate, retirement age exact to the month (and one month
earlier fails), unreachable → null, whatMustBeTrue never yields NaN, events are seen by solvers. e2e asserts the card has 4
rows and no NaN/null/undefined; screenshot `artifacts/plan-levers.png`. `npm run check` → 106/106.
**Needs Harvey's eyes:** the levers card wording and layout.

## 2026-11-13 T1.5 — Real ⇄ nominal display helpers
**Changed:** `src/engine/inflation.js` — `inflationFactor`, `toNominal`, `toReal`, `forDisplay(amount, at, mode)`,
`rowsForDisplay(rows, mode)` (money fields only; engine rows are end-of-month so they get one extra month of inflation),
`modeLabel` ("today’s money" / "future money (with inflation)"). Display-only: the engine stays in today's money (D4).
The toggle itself lands with Settings (T2.8) / answer-driven settings (T2.2c).
**Verified:** `tests/inflation.test.js` (6): factor at start / +1y / +10y / half-year / past, round-trips, the Instagram
$4.3M-in-26-years ≈ $2.26M today at 2.5%, identity for real mode, unknown mode throws, rows inflated per date with the
input untouched and nominal growth equal to the nominal return (caught and fixed an off-by-one-month in the first draft).
`npm run check` → 112/112.
**Needs Harvey's eyes:** nothing (no UI yet).

## 2026-11-13 T1.6 — Glide path + track status
**Changed:** `src/engine/glide.js` — `glidePath(scenario)` (pot needed at each month so the remaining plan lands exactly on
the target; `needToday` = what you'd need right now; events expanded), `glideAt(glide, ym)`, `trackStatus(actual, glide,
{tolerance, minBand})` → ahead / on-track / behind (±5% inclusive by default) with diff, band, ratio. Definition in D20.
**Verified:** `tests/glide.test.js` (7): ends at target and equals the coast-number line with no flows; starting at
`needToday` the engine projection lands on the target and every row sits on the glide (to 1e-9) with savings, fees and a
one-off; costs raise / savings lower the line; investShare and events respected; glideAt before/inside/after; trackStatus
exact ±5% boundaries, custom tolerance, min band, zero and negative glide. `npm run check` → 119/119.
**Needs Harvey's eyes:** nothing yet — the chip and chart use it in T2.3/T2.4/T3.1.

## 2026-11-13 T1.7 — Scenario schema validation + migrations
**Changed:** `src/engine/schema.js` — `validateScenario` (every field in SPEC v1 incl. items, pay steps, one-offs, pots,
events; errors carry a `path` and a plain-English message such as “Item 1 (“Rent”): ends (2026-01) before it starts
(2027-01).”), `migrateScenario` (v0 = pre-versioning → v1; newer versions refused with “update the app”), `parseScenario`
(text/object → migrate → validate). Backups now validate + migrate every scenario before import (SECURITY.md rule 7 ticked;
CSP ticked too).
**Verified:** `tests/schema.test.js` (9): SPEC example valid, onboarding output valid, readable errors for each bad
top-level field, retirement-in-the-past, assumptions wording, items (duplicate ids, kinds, amounts, dates, order, steps,
non-objects) with paths, one-offs/pots/events, v0 migration (input not mutated), newer/negative versions refused,
parseScenario on JSON text. Store tests extended for invalid scenarios in backups. `npm run check` → 128/128.
**Needs Harvey's eyes:** nothing.

## 2026-11-13 T2.1 — App shell
**Changed:** `src/ui/shell.js` — plain `#name` hash routes (`#plan #timeline #budget #scenarios #settings` + `#answers`
under Settings), bottom tab bar mounted once on `<body>` (outside the animating screen) with a sliding indicator,
directional slides by tab position (drill-in forward, out back; none under reduced motion), tap-the-current-tab scrolls to
top, safe-area padding, static (never animated) blur. `src/app.js` routes through the hash after onboarding; onboarding
screens have no tab bar; deep links + reload land on the same tab; "Start over" clears the hash. New screens: **Timeline v0**
(`src/ui/milestones.js`: today, Speedbird training start, First Officer, events, school starts, coast date, run-out warning,
super unlock, stop-work, each with age and projected pot), **Budget** and **Scenarios** as designed, honest "coming next"
states (no dead buttons), **Settings** as grouped rows (Your answers, export/import, start over, about). Onboarding now emits
`marks` for training/FO start. Reset no longer replays the screen entrance.
**Verified:** `tests/shell.test.js` (3): route parsing rejects anything but plain names, tab/sub-route mapping, slide
directions, milestone order/ages/pots. `tests/e2e/shell.spec.js` (4): no tab bar in onboarding; all five tabs in **light and
dark** (URL, heading, active tab, no overflow, screenshots `artifacts/shell-*-{light,dark}.png`); #answers keeps Settings lit;
browser back; deep link + reload; last content clears the tab bar; start over → onboarding with tab bar hidden.
`npm run check` → 131/131; e2e 6/6.
**Needs Harvey's eyes:** tab bar feel on the iPhone (height, blur, home-indicator spacing), indicator slide, and the Timeline list.

## 2026-11-13 T2.2b — Remaining answers mapped into the plan
**Changed:** `answersToScenario`: q14 (your share of training → one-off at course start), q15 (training loan → fixed annuity
repayments, yearly steps deflated to today's money), q76 (investing paused N months after each birth), q99 + q36 (mortgage
from the month after buying for years×12 payments; current rent stops), q111 (car running costs), q21 Captain and q3 UK
return as **timeline marks only**, q100/q87/q92 answered "yes" without a figure → *not placed* with the reason. Every
new figure is the user's own; none invented. Assumptions list explains each modelling choice. `docs/ONBOARDING.md` table updated.
q16 (income during training) stays unmapped: it's a choice with no amount — needs a new amount question (noted).
**Verified:** `tests/mapping.test.js` (11) — one per mapping, asserting exact months and amounts (e.g. loan: first payment
Mar 2029, last Feb 2039, nothing Mar 2039, annuity amount exact, deflation per year; mortgage: Jul 2034 → Jun 2059 = 300
payments, rent stops; leave: 0 investing Mar–Aug 2030 then back to £2,000), every scenario schema-valid and projectable.
`npm run check` → 142/142.
**Needs Harvey's eyes:** whether "investing pauses during parental leave" matches what you'd actually do (it's conservative).

## 2026-11-13 T2.2c — Answers drive settings
**Changed:** `src/ui/settings.js` — `settingsFromAnswers` (theme q136, tone q134, budget style q43, budget period q44 with
fallback to pay cycle q27, overspend flags q47, notifications q133 with "None" winning), `behindCopy` (three tones for
Behind / Runs short — calm in all, never "you will"/"guaranteed"), `applyTheme` (`data-theme` on `<html>` + browser chrome
colour). CSS dark tokens now apply for an explicit Dark choice or a dark phone unless Light is chosen. Settings has a
**Preferences** section; each row reopens that question, and Save / × return to Settings (generic `returnTo`). Notifications
are stored with an honest note that sending them comes with the installed app.
**Verified:** `tests/settings.test.js` (8): defaults, each mapping, pay-cycle fallback, None wins, labels, three distinct
tones with no banned words, applyTheme on a fake document. `tests/e2e/settings.spec.js` (4): Dark on a light phone (computed
background is the dark token; survives reload), Light on a dark phone, Gently → Bluntly changes the plan message, pay-cycle
fallback label and × returning to Settings. Screenshots `artifacts/settings-dark-override.png`, `artifacts/plan-tone-blunt.png`.
`npm run check` → 150/150; e2e 10/10.
**Needs Harvey's eyes:** the three tones' wording — pick the one that sounds like you want to be spoken to.
