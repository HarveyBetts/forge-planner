# DECISIONS — log every judgement call (decision · why · how to reverse)

**D1 — App name stays "Forge".** Harvey asked for it. Legacy app is kept as a reference repo only.

**D2 — New codebase, not an in-place edit of legacy Forge.** Harvey didn't answer "standalone vs inside Forge".
Chosen: standalone, because legacy Forge has permissive RLS + client PIN auth (fine for friends, unsafe for real
finances) and is one 640 KB file that is hard to unit-test. *Reverse:* port `src/engine` into legacy Forge as a Money tab
once its Phase 5 auth migration is done; the engine is dependency-free so it moves cleanly.

**D3 — No build step; plain ES modules.** Keeps Harvey's love of copy-paste deployability, but splits the code so
the engine is testable. *Reverse:* add a bundler later if the module count hurts load time.

**D4 — All maths in today's money (real terms), monthly compounding.** Avoids the Instagram post's hidden
inflation trap (their $4.3M ≈ 7.1% nominal). Nominal view is a display toggle (T1.5).

**D5 — Local-first, demo mode first.** UI works with LocalStore so Harvey can use it before Supabase exists and so
unattended runs never block on credentials.

**D6 — Separate Supabase project with Supabase Auth + owner-only RLS.** See docs/SECURITY.md.

**D7 — Tests use Node's built-in runner (`node --test`)** — zero dependencies for the engine; Playwright only for UI.

**D8 — Personal data kept out of git** (`data/seed.local.json`, gitignored; `seed.example.json` is sanitised).

**D9 — Onboarding runs on first launch, local-first.** Harvey asked for the questions to be answered in the app on
boot-up. Answers save to localStorage after every answer (`forge.onboarding.v1`, try/caught, in-memory fallback)
so it works before Supabase exists; sync is T2.2f. *Reverse:* none needed — the store is swappable.

**D10 — Question numbering matches the "Forge intake" doc (1–146).** So answers written there by number can be
entered or imported. New questions get numbers above 146.

**D11 — Quick start = 32 ★ questions** covering everything `answersToScenario` needs, so a usable plan exists after
~10 minutes. The full 146 can be finished later from Review.

**D12 — A negative projected pot is shown as a shortfall** ("Runs short", "short by £X") with the month money runs
out (`depletedAt`), never as a negative balance. The engine still compounds negatives (it models borrowing at the
investment return, which flatters nothing but is unrealistic) — T2.2b/T1.x may switch to a debt rate.

**D13 — Training length defaults to 18 months** (the Speedbird course length Harvey confirmed), logged as an
assumption on the plan. Currency conversion inside onboarding uses the legacy offline rate table until T1.1.

**D14 — The planner lives in `planner/` inside the `HarveyBetts/Forge` repo for now.** The session that picked up the
handover could only reach that repo and could not create `forge-planner` (H1). Building in a subfolder on a feature
branch keeps the legacy app at the repo root untouched (its Pages site is unaffected) and nothing is lost. Note:
GitHub only runs workflows from the repo-root `.github/`, so `planner/.github/workflows/*` are dormant until the split.
*Reverse:* H1 below — split `planner/` into its own repo with full history (`git subtree split`).

**D15 — FX differs from legacy on purpose in three places:** unknown currencies throw (legacy silently used 1:1, which
hides bugs); fetched rates are validated before use; the cache key is versioned (`forge.fx.v1`). Same source
(open.er-api.com, free, keyless, mid-market), same 6 h TTL, same USD-based maths, same offline table (+EUR from legacy).
CSP `connect-src` now allows `https://open.er-api.com`. *Reverse:* swap `FX_URL`; the module is injectable.

**D16 — T2.2a pulled forward to straight after T1.1.** The FX change touched `src/app.js`, and the old walk script couldn't
launch a browser in this environment, so the plan screen had no end-to-end cover. Moving the walk into the Playwright suite
first means every later app change is checked by a real browser walk.

**D17 — Pension/super access ages come from official sources (checked 13 Nov 2026), and stay editable per pot.**
- UK private/workplace pensions: normal minimum pension age 55, rising to **57 from 6 April 2028** — gov.uk policy paper
  "Increasing normal minimum pension age": https://www.gov.uk/government/publications/increasing-normal-minimum-pension-age .
  Modelled as: 55 if you turn 55 before April 2028, else 57. Schemes with a *protected pension age* differ → editable.
- Australian super: **preservation age 60 for anyone born on or after 1 July 1964** (55–59 for earlier births, ATO table),
  and you also need a *condition of release* (e.g. retiring) — ATO "Conditions of release":
  https://www.ato.gov.au/individuals/super/withdrawing-and-using-your-super/super-withdrawal-options/ .
- ISA / general investing / cash: no lock. (A Lifetime ISA would be 60 — not modelled; set `accessAge` if needed.)
Not modelled (yet): tax on withdrawals, super transfer to the UK (QROPS), the proposal to keep the UK NMPA 10 years below
state pension age (not legislated). *Reverse:* edit `src/engine/pots.js` `defaultAccessAge`.

**D18 — Multi-pot modelling choices.** (a) Cash grows at `assumptions.cashRealReturn`, default **0% real** (keeps pace with
inflation, no more) — shown as an assumption; before T1.2 cash silently compounded at the share return, which flattered the
plan. (b) Drawdown order: cash → invested → unlocked pensions/super; a locked pot is never drawn early — the shortfall
shows as negative *accessible* money and sets `depletedAt`. (c) "On track" still compares the *total* pot (incl. locked)
with the target, but any pot still locked at retirement is reported (`lockedAtRetirement`) and shown as a warning, because
the accessible money has to bridge the gap. A full bridge calculation is a later refinement. (d) Coasting compares an
"invested-equivalent" value (each pot grown at its own rate) with the coast number; with one pot it's identical to before.
*Reverse:* set `cashRealReturn` equal to the share return to get the old behaviour.

**D19 — Event templates' modelling conventions (T1.3).** Ages "X to Y" run from the Xth birthday month to the month
before the Yth (so school 4→18 stops at 18). Mortgages start the month after completion and run exactly `years × 12`
payments. Holidays are smoothed monthly (sinking-fund style) rather than lumped into specific months. Car replacements stop
at retirement unless `until` is given. Relocation keeps every amount in the base currency (the engine is single-currency)
and scales living-cost items by the % from the move month, including costs that start later. Events never invent money
figures: Speedbird salary/training costs, child costs and school fees, deposit, mortgage, car and trip costs are all inputs;
missing ones are reported, not guessed. Events that shorten existing items ("replaces" the karting job, relocation) record a
reversible `patch` so `expandEvents` stays idempotent. *Reverse:* conventions live in `src/engine/events.js` only.

**D20 — The glide path is "the pot you'd need now, given the rest of your plan".** Not a straight line and not just the
coast-number curve: it's the backward recursion of the engine step from the target, using the plan's own future cash flows
(investing, school fees, deposits…). With no future flows it equals the coast-number line. So a check-in is judged against
"enough to finish the plan as written", and big future costs correctly raise the bar. On-track band ±5% (inclusive),
editable. Simplifications: one real return for all money (no per-pot rates or locks) and contributions assumed invested
even after coasting. *Reverse:* swap `glidePath` for the plan's mid-case projection (`projectScenario(...).rows`).

**D21 — Moved to its own repo, `HarveyBetts/forge-planner` (13 Nov 2026), and the old app is being retired.** Harvey created the
repo; the `planner/` folder was split out with `git subtree split`, so this repo's history contains only planner commits and none
of the old app's code or keys. Supersedes D14. The old `Forge` repo and its Supabase project are to be deleted by Harvey (HUMAN_TODO H8).

**D22 — The event editor offers extra events, not the Speedbird pathway.** A plan built from answers treats the monthly
investing amounts (q50: now / in training / as a First Officer) as the money going in at each stage; living costs aren't
modelled separately. Adding a Speedbird *salary* event on top would count the same money twice. So the editor offers kids,
home, holidays, cars, trips and moving country (all costs on top of the answers), and its Speedbird card opens the course-start
question instead. User events live in `settings.events` (part of full backups; not a "scenario", so backup validation stays
strict). *Reverse:* once income and living costs are modelled as separate streams, add `speedbirdPathway` to `FORMS`.
