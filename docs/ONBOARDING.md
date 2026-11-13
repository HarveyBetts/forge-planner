# ONBOARDING — the questions Forge asks on first launch

**Status: built and working** (logic-validated + Playwright-walked at iPhone size; not yet device-verified on
Harvey's phone). Harvey asked for 100+ questions to be answered *in the app on boot-up* before anything else, so
the plan is built from his real answers, not from guesses. This file is how that works and what's left.

## What happens on boot (`src/app.js`)
1. **No saved answers** → Welcome: *Quick start* (32 ★ questions, ~10 min) or *Full plan* (all 146, ~40 min), plus
   "Restore answers from a backup".
2. **Started but not finished** → *Welcome back* with a progress ring: Continue · Review · switch Quick ⇄ Full.
3. **Finished** → the **Plan** screen (or the Review screen if a required answer is missing).

Question screens: one question per screen, progress bar + `n/total`, section label, ★ for key questions, help text,
the input, inline validation, **Back · Don't know · Next**, and "Skip for now". Single-choice and scale questions
auto-advance ~220 ms after a tap (so the tick is seen; instant under reduced motion). Enter submits typed answers.
"Skip for now" leaves a question unanswered; at the end of the list the flow loops back once to skipped ones.

Review screen: answered / to-go / % complete, "Answer the rest", every visible question grouped by section with its
current answer; tap any row to edit it (Save returns to Review). Export / import a JSON backup. "Start over" needs
two taps.

Plan screen (built from the answers via the engine): progress ring vs coast number, status chip
(**Coasting / On track / Behind / Runs short**), target pot, coast date or free money, low–high range at retirement
(a negative pot is shown as a shortfall, never as "−£300k"), pot-vs-coast chart, extra monthly needed, a list of the
life events placed on the timeline, what's *not* in the plan yet (with question numbers), and every assumption used.

## Files
| File | What it is |
|---|---|
| `src/onboarding/questions.js` | The bank: 146 questions, numbered to match the "Forge intake" doc. Types, options, `when()` conditions, ★ quick set, `map` tags. **Pure data.** |
| `src/onboarding/answers.js` | Pure logic: `validateValue`, `visibleQuestions`, `progress`, `next/prevQuestion`, and **`answersToScenario()`** (answers → engine scenario + assumptions + not-placed list). |
| `src/onboarding/state.js` | Save after every answer (localStorage key `forge.onboarding.v1`, all access try/caught, in-memory fallback), `setAnswer/setUnknown`, export/import. |
| `src/onboarding/inputs.js` | Renders each answer control and reads it back (DOM). All user text escaped. |
| `src/ui/format.js` | `esc`, `money`, `monthLabel`, `summarize` (answer one-liners for Review). |
| `src/fx/fallback.js` | Approximate offline GBP/AUD rates (from legacy Forge) used until T1.1 lands. UI labels conversions "approximate". |
| `tests/onboarding.test.js` | 22 unit tests: bank integrity, validation, conditions, progress, mapping, storage failure modes, backup round-trip. |
| `tests/e2e/onboarding.spec.js` | Playwright walk of Quick start with **sample** answers → plan; fails on console errors or horizontal overflow; screenshots to `artifacts/`. |
| `docs/QUESTIONS.md` | Human-readable list, **generated** — run `npm run docs:questions` after editing the bank. |

## Answer storage format
```json
{ "v": 1, "mode": "quick|full", "pos": "q12", "startedAt": "…", "updatedAt": "…", "completedAt": "…|null",
  "answers": { "q1": { "v": "1997-03" }, "q3": { "unknown": true }, "q63": { "v": { "amount": 50000, "currency": "GBP" } } } }
```
`{unknown:true}` = "Don't know" (counts as answered, never used as a value). Missing key = not answered yet.
Value shapes per type are documented at the top of `questions.js`.

## How answers become the plan (`answersToScenario`)
Required: **q1** birth, **q4** retirement age, **q63** retirement income. Without them it returns `missing` — it never guesses.

| Answer | Becomes |
|---|---|
| q7 | base currency; every money answer converted into it |
| q49 | separate pots: cash £ and A$ (0% real growth), Stocks ISA, super (locked until its ATO preservation age), other |
| q50 + q11/q12 | investing steps: *now* → *during training* from course start → *as FO* from course start + 18 months |
| q55, q66, q64/q65 | nominal return, withdrawal rate, other retirement income (default 7% / 4% / none — each logged as an assumption) |
| q57 | `redirectAfterCoast` (spend instead of invest once coasting) |
| q74 + q79/q81/q82/q85/q86 | per child: childcare from birth to school age; private-school fees + extras from start age to 18 |
| q94/q97/q98 | house deposit one-off at the chosen month |
| q107/q110 | car purchase at FO start (or now), repeated every N years |
| q113, q73, q58, q59 | trip, wedding, lump sum in, big purchase out — placed only if dated |
| q116 | family holidays per year from first child (or FO start, or now) |
| q14 | the part of training you pay yourself → one-off at course start (total alone → not placed) |
| q15 | training loan → fixed annuity repayments for years×12 months from the start month, as yearly steps deflated to today's money |
| q76 | parental leave → investing paused for N months from each birth (conservative; labelled) |
| q99 (+q36) | mortgage from the month after buying for years×12 payments, level in today's money; rent you pay now stops then |
| q111 | car running costs from the first planned car (FO start), or from now |
| q21 / q3 | Captain upgrade / move back to the UK → **timeline marks only** (no pay or cost figures to use) |
| q100, q87, q92 | "yes" with no figure (buying costs, university, faster fee inflation) → *not placed*, with the reason |
| q11/q12 | timeline marks: training starts, First Officer (reduced scale) |

Anything partially answered goes into `notPlaced` with the question number, so the Plan screen can say what's missing.
Events dated before today or after retirement are dropped and noted.

## Rules for changing the bank
- Keep numbering stable (`id: 'q<n>'`): backups and the intake doc refer to numbers. Add new questions at the end of
  their section with the next free number above 146, and note it in DECISIONS.md.
- Every question must render, validate and summarise for its type — `tests/onboarding.test.js` enforces the shape.
- Never add a default that is a personal or financial *fact* (pay, fees, tax). Help text may say "use a placeholder".
- After editing: `npm run check`, `npm run docs:questions`, and the e2e walk.

## Follow-ups (also in TASKS.md, T2.2a–f)
a. ~~Port the walk into the Playwright suite and run it in CI.~~ Done (T2.2a).
b. ~~Map the remaining answers~~ Done (T2.2b) except q16 (income during training: a choice with no amount — needs an amount question). Map the remaining answers into the scenario: training cost/loan repayments (q14/q15), income during training (q16),
   parental-leave dip (q76), mortgage payments + buying costs (q99/q100), university (q87), school-fee inflation (q92),
   car running costs (q111), captain upgrade (q21), UK return / relocation (q3) — each with tests.
c. ~~Done (T2.2c).~~ Let answers drive app settings: theme (q136), tone of "behind" messages (q134), budget style/period (q43/q44/q27),
   notifications (q133), overspend flags (q47).
d. ~~Done (T2.2d).~~ "What changed" summary when an edited answer moves the plan (e.g. coast date +3 years).
e. ~~Done (T2.2e) — Welcome and Your answers → “Paste answers from the intake doc”.~~ Paste-in import of answers typed in the "Forge intake" doc (numbered lines) → review screen → confirm before saving.
f. Phase 4: sync answers to Supabase (`onboarding_answers` table is already in `supabase/schema.sql`); add the
   Supabase origin to the CSP `connect-src` in `index.html` at the same time.
