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

## 2026-11-13 T2.2d — "What changed" after editing an answer
**Changed:** `src/ui/whatchanged.js` — `planSnapshot` (status, coast date, run-out month, target, pot at stop-work age) and
`diffSnapshots` → plain-English lines ("Coast date moved from Mar 2031 to Feb 2034 (2 years 11 months later).", "Status:
Behind → Runs short.", "Your savings no longer run out.", "Target pot: £1.0M → £1.5M."), ignoring moves under 0.5%/£100.
The app snapshots the plan before and after an edited answer (Save or Don't know) and shows a one-shot **What changed** card
at the top of the screen you return to (Your answers or Settings), or "Saved question N. Your plan’s numbers didn’t change."
**Verified:** `tests/whatchanged.test.js` (5): coast later/sooner/new/lost with spans, status + run-out + age + target + pot
(shortfall wording), noise threshold, plan appearing/disappearing, AUD formatting, and a real answers→engine run where raising
retirement spend moves the target and pushes coast later. `tests/e2e/whatchanged.spec.js` (2): edit q63 → card shows the
target change, disappears after navigating; a theme edit says nothing moved. Screenshot `artifacts/what-changed.png`.
`npm run check` → 155/155; e2e 12/12.
**Needs Harvey's eyes:** whether the card should also appear on the Plan screen itself.

## 2026-11-13 T2.2e — Paste in answers from the intake doc
**Changed:** `src/onboarding/paste.js` — `parsePastedAnswers` (numbered lines “1.” “Q4:” “7)” “11 -” “Q12 …”; wrapped lines
join the previous answer; echoed question text stripped; duplicates → last wins with a note; unknown numbers and un-numbered
lines reported), readers for months (“Sept 27”, “03/1997”, “15/03/1997”…), money (“£50k”, “A$15,200”, “15200 aud”, “1.2m”; a
bare “$” is read as A$ with a note), numbers, fuzzy choices (exact → prefix → contains; ambiguity is an error, not a guess),
multi-choice lists, field answers (“ISA: 14,000; super: A$15,200” or positional only when the count matches, flagged
“check each part”), and “don’t know” (unless “Not sure” is a real option). Every value goes through the normal validator.
UI: “Paste answers from the intake doc” on Welcome and Your answers → paste → **Check your answers** preview (ready / need you
/ notes, “Replaces your current answer” flags, what you wrote for unreadable ones) → **Save N answers** or edit/cancel.
**Verified:** `tests/paste.test.js` (9) incl. a deliberately messy paste and unreadable answers never becoming values.
`tests/e2e/paste.spec.js`: empty paste error, preview counts, storage byte-identical after Read / Edit / Cancel (nothing saved
without confirmation), then Save stores exactly the 5 readable answers. Screenshot `artifacts/paste-preview.png`.
`npm run check` → 164/164; e2e 13/13.
**Needs Harvey's eyes:** try pasting your real intake-doc answers — anything it can't read is listed with the reason.

## 2026-11-13 T2.3 — Plan dashboard
**Changed:** `src/ui/dashboard.js` — pure `dashboardModel`: status chip from **today's pot vs the glide path** (Ahead / On track
/ Behind, ±5%; "Runs short" wins if savings run out), tone-aware message, ring = pot ÷ coast number capped at 100% with a
**Coasting · +£X surplus** state, **free money this month** (un-invested share + planned investing once coasting; never double
counts redirect-after-coast). Plan screen: "Today’s money · 2.5% inflation assumed" label, ring colour follows status
(green / blue / amber — always with icon + word), "£X needed today to stay on plan", Free money card (green when there's some),
Target + Coast date KPIs, **Assumptions disclosure** (collapsible, count badge, "estimate" tags), count-up of the ring % and free
money in step with the ring fill — **first Plan view per session only**, none under reduced motion. Scenarios card uses the
same status. New `--warn` token (#F59E0B) for the amber ring.
**Verified:** `tests/dashboard.test.js` (5): on-track inside ±5% (both edges), ahead/behind beyond it, blunt tone, runs-short
priority, ring cap + coasting surplus, free money (coasting, investShare 80%, none, redirect). `tests/e2e/dashboard.spec.js`
(5): Ahead / On track (pot computed with the same engine) / Behind / Coasting — chip, label, ring %, free money, disclosure opens,
no overflow; count-up once per session and not at all under reduced motion. Screenshots `artifacts/dashboard-{ahead,on-track,
behind,coasting}.png`. `npm run check` → 169/169; e2e 18/18.
**Needs Harvey's eyes:** ring fill + count-up timing on the phone; whether "£X needed today to stay on plan" is clear.

## 2026-11-13 T2.4 — Projection chart
**Changed:** `src/ui/chart.js` — `chartModel` (yearly samples of the middle case plus full 4% and 9% runs, glide path, target,
coast month, actual check-ins), `chartSVG` (fan area, middle line, dashed "what your plan needs" line, target line, green coast
marker — "Coasting now" when already there — actuals as dots, labelled money axis and age axis, descriptive `aria-label`),
`readoutAt` (tap position → "Age 46 (Nov 2043): about £703k, range £503k – £886k; plan needs £573k; you had …"). Shortfalls are
drawn at the baseline and said in words. Plan screen uses it with a legend and an aria-live readout; tap or drag (touch) moves a
rule line — no hover tooltips. The range line names the middle-case return actually used.
**Verified:** `tests/chart.test.js` (7): all layers, yearly sampling, never coasts (no marker), already coasting ("Coasting now"
at the start), shortfall at the baseline + words, actuals dots + readout, too-short plan → nothing drawn, taps clamped.
`tests/e2e/chart.spec.js` (3): typical / never-coasts / coasting render without NaN, tap updates the readout and shows the rule,
no overflow. Screenshots `artifacts/chart-{typical,never-coasts,coasting}.png`. `npm run check` → 176/176; e2e 21/21.
**Needs Harvey's eyes:** chart legibility at phone size, and the tap/drag feel.

## 2026-11-13 T2.5 — Timeline scrubber
**Changed:** `src/ui/timeline.js` (pure model: stops, readout at any month, readout text, stop-to-stop jumps). Timeline tab:
readout card (date · age, life stage, projected pot or "short by", what happens that month), a native range slider (so keyboard,
VoiceOver, Home/End all work) with small milestone dots under it aligned to the thumb's travel, snap onto a moment when you let go
within 4 months of it, spring-eased Previous / Next (instant under reduced motion), the list below highlights where you are.
Fixed while testing: rapid taps during the spring stepped from the overshoot; dots a year apart had overlapping tap targets; a drag
starting on a dot grabbed the dot (dots are now visual only); touching the slider mid-spring let the thumb keep moving under your
finger (touch now stops the spring); dots and thumb drifted apart by up to 14px at the ends.
**Verified:** `tests/timeline.test.js` (3): stops at the right months, readout follows position (age, pot, stage, cash flow,
clamping), readout text, jumps. `tests/e2e/timeline.spec.js` (2): ArrowRight / End / Home, Next / Previous (from the
destination), tap near a dot snaps onto it, drag to ~75%, list highlight; reduced motion jumps with no tween. Screenshot
`artifacts/timeline-scrub.png`. `npm run check` → 179/179; e2e 23/23.
**Needs Harvey's eyes:** drag feel and snapping on the phone.

## 2026-11-13 T2.6 — Life-event editor
**Changed:** `src/ui/sheet.js` (bottom sheet on `<body>`: CSS grip, drag-to-dismiss from the grip or when scrolled to the top,
Escape / backdrop to close, slide in/out with the motion tokens; plus a small toast). `src/ui/eventforms.js` (form definitions for
child, home, holidays, car, trip, move country; form ⇄ params; validation is the engine's own `eventProblems`). App: one
`buildScenario()` = your answers + the events you added, used by the plan, chart, levers, timeline and "what changed". Timeline
has "Events you’ve added" + **Add a life event**; the Plan's life-events card has "+ Add a life event" and your own events are
tappable to edit. The sheet shows a **live preview** ("Coast date moved from Sep 2043 to Jun 2050…") as you type; Save/Add/Delete
(two taps) update the screen in place with a toast. Speedbird card opens the course-start question (D22). Amounts accept "£60,000".
**Verified:** `tests/eventforms.test.js` (6): every form maps to an engine template, Speedbird not offered, trip → exact cash
flow, child bands/school/optionals, readable problems, event → form → event round-trip for every template, labels/ids.
`tests/e2e/events.spec.js` (2): add (empty save shows the engine's message; preview appears; save closes the sheet; shows on the
Timeline and the Plan; coast date changes; survives reload), edit from the Plan, delete with confirm (coast date returns), Escape
closes, Speedbird card → q12 → × back to Timeline. Screenshots `artifacts/events-picker.png`, `artifacts/events-form.png`.
`npm run check` → 185/185; e2e 25/25.
**Needs Harvey's eyes:** sheet drag-to-dismiss feel on the iPhone; the preview wording.

## 2026-11-13 T3.2 — Budget model = Harvey's weekly ledger
**Changed:** `src/budget/ledger.js` (pure): Monday weeks + labels, budget shape (categories with signed amounts — money in +,
out −; row total = sum, like the sheet's TOTAL), `weekRow` (income / spent / refunds / total), immutable `setEntry` (blank or 0
clears), `categoryTotals`, `cashForecast` (opening cash + every week; income lands `payLagWeeks` late), `forecastBy` (the sheet's
fortnightly "At End" rows), `upcomingBills` (next due date, month-end clamp, yearly bills), generic starter categories,
symmetric penny rounding. Task list re-ordered so Harvey's spreadsheet comes first (D23).
**Verified:** `tests/budget.test.js` — the forecast reproduces the spreadsheet's own fortnightly formulas **exactly** on a
made-up 30-week budget with pay 2 weeks late; no-lag variant; week rows incl. refunds; immutability; range totals; bills.
`npm run check` → 195/195.
**Needs Harvey's eyes:** nothing yet (UI is T3.7).

## 2026-11-13 T3.5 — Investments model
**Changed:** `src/budget/investments.js` (pure): `parseQty` (handles the invisible characters copy-pasted share quantities
carry), `parsePrice` ($ → USD, £ → GBP, € → EUR, "125p"/GBX → pence), `holdings(lots, prices, toGBP)` — rolls purchase lots up per
ticker like the sheet's right-hand table: shares, total cost £, average cost £, average buy price, currency, price, value £,
gain £ and % — with totals that leave unpriced holdings out of the gain and list them.
**Verified:** in `tests/budget.test.js`: parsing (incl. word-joiner characters), GBP/USD/GBX lots, mixed-case tickers merged,
unpriced holding handled. (Committed with T3.2.)
**Needs Harvey's eyes:** nothing yet.

## 2026-11-13 T3.6 (part 1) — Read the .xlsx and map it by headings
**Changed:** `src/budget/xlsx.js` — a dependency-free .xlsx reader (zip directory + browser `DecompressionStream('deflate-raw')`,
injectable zlib for Node; shared / inline / formula-cached strings, numbers, booleans). `src/budget/importsheet.js` — finds the
budget by its DATE + INCOME headings (categories = the columns up to TOTAL; weeks = the rows down to TOTAL; year inferred so weeks
start on Mondays), the "Current" balance and "Premium Bonds Total" (number under the label), bills (a name next to "14th" /
"4th May"), the "At End" table (→ pay lands 2 weeks late), and the investments by their TICKER tables (purchase lots + the saved
live prices / currencies / company names). Missing pieces become warnings, never crashes.
**Verified:** `tests/importsheet.test.js` (6) on a made-up workbook generated in the test with the same layout
(`tests/fixtures/xlsx-fixture.js`, no personal data). Privately (not committed) against Harvey's real file: 30 weeks, 21
categories, 7 bills, pay lag, Premium Bonds, 10 purchases / 5 holdings all priced; the app's 16 fortnightly balances equal the
sheet's own cached values to the cent, and total cost matches exactly. `npm run check` → 201/201.
**Needs Harvey's eyes:** nothing yet — the import screen comes with T3.7.

## 2026-11-13 T3.6 + T3.7 — Import screen and the Budget tab
**Changed:** Budget tab (`src/app.js` + `src/budget/view.js`): empty state with **Import my spreadsheet** (.xlsx, read on the
phone) or **Start from scratch**; **Check your import** (weeks / categories / holdings, what came across, warnings, "replaces the
budget on this phone") → Save or Cancel — nothing stored before Save. **Money**: net worth today in the base currency (cash in A$,
Premium Bonds, investments; live FX badge), the week with always-editable cells (type what you spent; "+" for money back; Return
commits; totals, forecast and net worth update in place without a redraw), week ‹ ›, **cash by fortnight** with the pay lag,
lowest point highlighted and a warning if it goes below zero, **bills coming up**. **Investments**: total value / cost / gain,
holdings with average cost and gain %, tap to update a price, add a purchase. **Use these as my current balances** → previews
the plan change → writes q49 (cash A$, Premium Bonds as £ cash, investments as Stocks ISA; super untouched). Remove budget (two
taps). Store gains `getBudget/saveBudget/removeBudget`; budgets ride along in full backups (validated). `docs/BUDGET.md`;
HUMAN_TODO H9 (how to import from Google Sheets).
**Verified:** `tests/budget.test.js` (+3: cash today, net worth across currencies, typed-amount sign rules, default week);
`tests/store.test.js` (+1: budget save/backup/damaged). `tests/e2e/budget.spec.js` (2): import → preview (storage still empty)
→ cancel (still empty) → import → save; exact net worth at fixed rates and date; week values; edit food and a "+15" refund → totals
and forecast update, persisted after reload; week navigation; bills ("tomorrow"); investments total, price update; use balances →
q49 written with super untouched. Non-xlsx file → readable error; start from scratch; remove. Screenshots
`artifacts/budget-import-check.png`, `budget-money.png`, `budget-investments.png`. `npm run check` → 205/205; e2e 27/27.
**Needs Harvey's eyes:** import your real sheet (H9) and check the numbers against Google Sheets. Typing amounts into the
week rows on the phone.

## 2026-11-13 T2.8 — Settings: full backup, restore, delete all, assumptions
**Changed:** Settings → **Money and assumptions**: main currency (q7), investment return (q55), withdrawal rate (q66) open their
questions; **inflation** and **cash growth after inflation** are real settings (sheet with a % input, range-checked, "use the
default"), stored in `settings.assumptions` and fed into `answersToScenario` (which now takes `inflation` / `cashRealReturn`, used
for the scenario, the loan deflation and the assumption wording); saving shows what moved in a toast. **Your data**: **Back up
everything** downloads one JSON (answers, events, budget, settings) named `forge-backup-YYYY-MM-DD.json`; **Restore from a backup**
accepts a full backup (asks first — "replaces everything", with counts — then reloads) or an older answers-only backup (merged as
before); **Delete all my data** (two taps) wipes every Forge key and returns to the welcome screen. Done ahead of T2.7 because the
old export only saved answers — with a budget and events on the phone, that risked losing data.
**Verified:** `tests/mapping.test.js` (+1: overrides reach the scenario, wording and loan deflation; defaults unchanged).
`tests/e2e/backup.spec.js` (2): import a budget + add an event + set inflation 3% → back up (file name, contents checked) → delete
all (storage empty, welcome screen) → restore from the welcome screen (confirm sheet with counts) → inflation, event, budget and
the plan's assumption all back; junk file → readable message. `npm run check` → 206/206; e2e 29/29.
**Needs Harvey's eyes:** where the backup file lands on the iPhone (Files → Downloads) — keep a copy in iCloud Drive.

## 2026-11-13 T2.7 — Scenario compare
**Changed:** `src/ui/compare.js` (pure): `applyWhatIf` (a copy of your answers with kids / age at first child / stop-work age /
retirement spend / investing now changed), `describeChanges`, `compareModel` (status, coast date with "3 yrs 2 mths later",
pot when you stop, target, needed today, free money, stop-work age, savings run out — each with a delta and which side is better).
Scenarios tab: your plan + your what-ifs (status chip, coast, pot), **New what-if** sheet with a live "compared with your plan"
preview and "include the life events I added"; **Compare with your plan** → side-by-side view (A vs B, winners ticked, deltas);
edit / delete (two taps). What-ifs live in `settings.whatifs` (in backups); your real answers are never changed.
`buildScenario` takes an answers object so what-ifs reuse the exact plan pipeline.
**Verified:** `tests/compare.test.js` (4): only the asked changes are applied (original untouched), wording, one-more-child deltas,
coasting / never-coasting / running-out / shortfall wording. `tests/e2e/compare.spec.js`: **1 child vs 2 children** — create with
live preview, compare shows a lower pot (A ticked), same target, more needed today; real answers still 1 child; edit pre-filled;
delete. Screenshot `artifacts/compare-1-vs-2-children.png`. `npm run check` → 210/210.
**Needs Harvey's eyes:** whether the compare rows are the ones you care about.

## 2026-11-13 — Fix: e2e test left behind by T2.8
T2.8 renamed Settings' "Start over" to "Delete all my data" but `tests/e2e/shell.spec.js` still clicked "Start over", so CI's e2e job
failed on the T2.8 and T2.7 pushes (the site kept deploying — Pages only gates on `npm run check`). Test updated; full e2e suite
30/30 locally. Process fix: the local commit script now runs the whole Playwright suite before every commit, not just unit tests.

## 2026-11-13 T2.9 — Stranger test: empty, minimal, blocked storage, errors
**Changed:** Safety net: if any screen throws, Forge shows "Something went wrong" (data is safe; Back up everything / Go to your
answers / Reload; details for Claude) instead of a blank page — logged as a warning. Failed async work (a save, a file read) shows
"Something didn’t save — please try again". Both stores now **probe storage when they start**, so blocked/full storage (private
mode, quota) is flagged on the very first screen (before, the warning only appeared after the first failed save — found by the new
test). Importing a spreadsheet shows "Reading your spreadsheet…". The onboarding walk helper moved into `tests/e2e/helpers.js`.
Designed empty states already in place: Budget (import / start from scratch), Timeline + Scenarios ("a few answers missing"),
"Events you’ve added" (explains what to add), what-ifs, investments ("No holdings yet").
**Verified:** `tests/e2e/stranger.spec.js` (3): empty browser → Quick start answering only the 3 required questions → plan, all
five tabs render with no overflow, no crash card, no console errors, a life event can be added; **storage blocked entirely** → boots,
warns on the welcome screen and in Settings, works in memory across all tabs; a corrupt answer → safety-net card → "Go to your
answers" works. `tests/store.test.js` (+1: probe). Screenshots `artifacts/stranger-minimal-plan.png`, `stranger-safety-net.png`.
`npm run check` → 211/211; e2e 33/33.
**Needs Harvey's eyes:** nothing specific — this is the "a stranger opens it" safety work.

## 2026-11-13 T3.1 — Monthly check-in
**Changed:** `src/ui/checkin.js` (pure: the q49 pots with fixed currencies, typed values → q49 — blank removes, unreadable keeps —
snapshot shape, "Up £2.1k since Oct 2026" trend, 30-day backup reminder). Plan screen: **Monthly check-in** card (last check-in and
status, last six months as tiles with status colours, trend, "Check in for Nov 2026" / "Update this month", backup nudge with a
one-tap **Back up everything** — SECURITY.md rule 9). The check-in sheet asks for each pot today (pre-filled), can **fill cash,
Premium Bonds and investments from the budget**, then updates q49 (so the plan's status against the glide path moves), saves a
snapshot `{ at, pots, total, status, need }` (one per month; updating replaces it) and toasts the new status + what moved. Backups
record `lastBackupAt`.
**Verified:** `tests/checkin.test.js` (3). `tests/e2e/checkin.spec.js` (2): with last month's check-in on the phone, check in with a
bigger ISA → chip **Behind → Ahead**, card "Last: Nov 2026 · Ahead", two history tiles, "Up £381k since Oct 2026", snapshots stored
as Oct behind / Nov ahead, q49 updated; backing up clears the nudge; "fill from my budget" puts investments £1,870, Premium Bonds
£2,000 and A$3,839 into the form. Screenshot `artifacts/checkin-card.png`. `npm run check` → 214/214; e2e 35/35.
**Needs Harvey's eyes:** do a real check-in at the start of each month.

## 2026-11-13 T3.4 — Reality check
**Changed:** `src/budget/reality.js` (pure): from the budget's weeks that have **started** (Harvey's sheet also holds planned future
weeks; last 8 by default) → average money left over per week (money in − money out) → per month (× 52/12) in the base currency,
compared with the monthly investing the plan assumes now → `more` / `close` (±10%) / `less` / `negative` / `too-few`. A **Reality
check** card on the Plan and in Budget → Money says it plainly ("Your budget leaves about £1,020 a month — more than the £500 your
plan assumes…", or "…spending more than comes in"), names the weeks used, and offers **Plan with £X a month** → preview of what
moves → updates q50 "now" only (training / First Officer amounts untouched).
**Verified:** `tests/budget.test.js` (+1: started weeks only, weekly → monthly maths, all verdicts, look-back window).
`tests/e2e/checkin.spec.js` (+1): sample budget with four weeks started → "more than the £500" → Plan with ≈£1,020 → q50 updated →
card now says "in line with". Screenshot `artifacts/reality-check.png`. `npm run check` → 215/215; e2e 36/36.
**Needs Harvey's eyes:** with your real sheet, does the "left over" figure match what you actually manage to put away?

## 2026-11-13 T3.3 — Bank CSV import
**Changed:** `src/budget/csv.js` (pure): RFC-4180 parser (quotes, CRLF, BOM), date and amount readers for the forms banks use,
`detectColumns` (header names, or inferred columns for header-less files like CommBank; day-first vs month-first detected; Money
in + Money out supported), `toTransactions` (malformed rows reported with line numbers and reasons, £0 holds dropped, a stable
fingerprint per transaction — two identical coffees on one day both count), `merchantKey` (groups noisy descriptions), and
`applyTransactions` (adds into the week's category total, skips anything already imported). Budget → Money → **Import bank
transactions (CSV)** → **Sort your transactions** (new / already in / unreadable, expandable list of unreadable rows, "these
amounts are in" currency with live conversion, one category per place with remembered choices and Income guessed for money in) →
Add. `docs/BUDGET.md` section.
**Verified:** `tests/csv.test.js` (8) with fixtures `tests/fixtures/commbank-sample.csv` (no header) and `monzo-sample.csv`
(header) — made-up data: parsing, dates/amounts, column detection for both banks, malformed rows, money in/out, readable errors,
merchant keys, weekly totals and re-import adding nothing. `tests/e2e/csv.spec.js` (2): CommBank file into the A$ budget → exact
week totals (e.g. food A$178.20, rent A$1,100, income A$2,290) → same file again: 0 new / 6 already in → a £ Monzo file converted
into A$; junk file → readable message. Screenshot `artifacts/csv-sort.png`. `npm run check` → 223/223; e2e 38/38.
**Needs Harvey's eyes:** try an export from your bank app (CommBank: NetBank → Transactions → Export → CSV).

## 2026-11-13 T3.2b — Planned vs actual, and what coasting frees up
**Changed:** `src/budget/plan.js` (pure): weekly plan per category (`budget.plan`), `weekVsPlan` (actual vs plan, over / short),
`overPlan`, `setPlan`, `flagLevel` (how loudly to flag overspending, from q47: off / quietly / a nudge / loud and clear). Budget →
Money: tap a category's name → **weekly plan** sheet; each row shows a small progress bar and "of A$100" or "A$21 over" (bar and
words depend on the flag level; "Loud and clear" adds an "Over plan this week: Food by A$21." banner); hints update in place as you
type. **When you coast** card: the plan's investing at the coast date, converted to the budget currency **per week** ("From Mar 2041,
your planned £1,500 a month of investing becomes optional — about A$649 a week you could spend instead"), or that it stays needed.
**Verified:** `tests/budget.test.js` (+1). `tests/e2e/plan-vs-actual.spec.js` (2): set Food A$100 → "A$21 over" with bar, no banner
(default nudge) → edit to 60 → "of A$100"; coast card shows A$649 a week; "Loud and clear" → banner; "Don’t flag it" → no bar, no
warning words. Screenshot `artifacts/plan-vs-actual.png`. `npm run check` → 224/224; e2e 40/40.
**Needs Harvey's eyes:** set plans for your big categories (rent, food) and see if the nudges feel right.

## 2026-11-13 T7.1 — CI + Pages confirmed
**Verified:** every push since the e2e fix has a green **CI** run (unit checks + the full Playwright suite on GitHub's Ubuntu) and
a successful **Deploy to GitHub Pages** run (e.g. T3.3: CI run 13 ✅, Pages run 13 ✅). The site is live at
https://harveybetts.github.io/forge-planner/ . H2 marked done.

## 2026-11-13 T6.1 — Installable, offline Forge
**Changed:** `manifest.webmanifest` (standalone, colours, icons), `icons/` (192, 512, maskable 512, apple-touch 180, favicon 32, SVG)
**rendered from the original Forge "blades" logo** (its vector paths taken from the old app and composed on the same blue gradient),
iOS head tags (status bar, apple-touch-icon, description), `sw.js` (cache-first app shell; same-origin GETs only; navigations and
deep links get the cached page; FX and fonts untouched; old versions' caches deleted on activate), `build-site.sh` stamps the worker
with a version and the exact staged file list (and also refuses `.xlsx`). The app registers the worker only over HTTPS and toasts when
an update is ready. Welcome screen uses the real icon. Checklist in `docs/PWA.md` (D24: Phase 6/7 before mock-only backend work).
**Verified:** `tests/pwa.test.js` (3): manifest + icon files + head tags; the built worker's precache list equals exactly the staged
files and contains nothing from data/docs/tests; the worker run in a sandbox installs, clears an old version, serves cache-first,
serves the shell for navigations, works offline, ignores cross-origin and POST. `tests/e2e/pwa.spec.js`: the built site installs
its worker in Chromium, then **opens with the network cut**, deep link included. `npm run check` → 227/227; e2e 41/41.
**Needs Harvey's eyes:** delete the current home-screen icon, re-add from Safari (Share → Add to Home Screen) to get the new icon;
then try opening it in flight mode.

## 2026-11-13 T7.2 — README for Harvey
**Changed:** `README.md` rewritten for Harvey: the link, putting it on the iPhone, first steps (questions / paste from the intake doc,
import the spreadsheet, real balances, life events, monthly check-in), what each tab is for, where data lives and how to back up /
restore / delete, what to do if something breaks; developer notes kept short at the bottom.
**Verified:** links and steps match the shipped UI labels (checked against `src/app.js`). `npm run check` green.
**Needs Harvey's eyes:** read it once — anything confusing is a UI-wording bug too.

## 2026-11-13 T6.4 — Privacy and "not financial advice" pages
**Changed:** two in-app pages under Settings → About (routes `#privacy`, `#advice`, Settings tab stays lit, back button):
**Privacy** — everything stays on the phone, no account, no bank logins, no tracking; exactly what's stored; what leaves the phone
(exchange-rate requests to open.er-api.com with no personal data; Google Fonts sees the IP address; imported files never leave);
export (with a Back up everything button right there) and delete; future sync would be opt-in and private. **Not financial advice** —
a planning tool, estimates in today's money as ranges, what isn't modelled (tax, fees, sequence risk, FX swings), access ages are
sourced estimates, never a promise, check big decisions with your provider / a regulated adviser. The Plan's footer
"Estimates, not financial advice." links to it. (SECURITY.md rule 8 met for the local-only app; delete-account comes with accounts.)
**Verified:** `tests/shell.test.js` (+1 routes). `tests/e2e/about.spec.js`: both pages reachable, key statements present, no
"guarantee", backup downloads from the privacy page, footer link works, no overflow. Screenshot `artifacts/privacy.png`.
`npm run check` → 228/228; e2e 42/42.
**Needs Harvey's eyes:** read the two pages — they should match how you want Forge to treat people's data.
