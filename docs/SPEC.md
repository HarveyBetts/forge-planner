# SPEC — product & scenario schema

## First launch
Onboarding questions run before any other screen and feed the plan. Full detail: `docs/ONBOARDING.md`; question list: `docs/QUESTIONS.md`.

## Screens (bottom nav)
1. **Plan (home)** — progress ring (invested pot ÷ coast number), status chip (ahead / on track / behind vs glide path),
   "free money this month" (planned investing once coasting), retirement target, coast date, assumptions disclosure.
2. **Timeline** — scrub from today to retirement; life-stage markers (training, First Officer, kids, house, trips);
   age / pot / monthly cash-flow readout; animated transitions between stages.
3. **Budget** — categories, transactions, planned vs actual, CSV import; shows how much is "freed" by coasting.
4. **Scenarios** — named scenarios ("1 child", "2 children + UK return 2028"), duplicate, compare A vs B.
5. **Settings** — currencies (base/secondary), assumptions with plain-English help, backup export/import, account, AI.
Floating **Ask Forge** (AI) from Plan and Timeline.

## Inputs
Date of birth · target retirement age · retirement spend (today's money) · other retirement income (state/workplace
pension — user-entered) · withdrawal rate · nominal return · inflation · opening pots · income streams (with pay
steps) · expenses · one-offs · life events (templates) · invest share of surplus · redirect-after-coast toggle.

## Outputs (all in today's money, base currency, with ranges)
Target pot · coast number now · coast date · retirement pot (low/mid/high) · on-track gap · required extra monthly
contribution · freed money total · year-by-year rows for charts.

## Scenario JSON (v1) — `src/engine` consumes this
```json
{
  "schemaVersion": 1,
  "name": "Base",
  "start": "2026-11",
  "birth": "YYYY-MM",
  "retirementAge": 60,
  "openingPot": 0,
  "investShare": 1,
  "redirectAfterCoast": false,
  "assumptions": {
    "nominalReturn": 0.07, "inflation": 0.025, "withdrawalRate": 0.04,
    "retirementSpend": 0, "otherRetirementIncome": 0
  },
  "items": [
    { "id": "pay", "name": "Salary", "kind": "income",
      "steps": [{ "from": "2027-09", "monthly": 0 }], "from": "2027-09", "to": null },
    { "id": "living", "name": "Living costs", "kind": "expense", "monthly": 0, "from": "2026-11", "to": null }
  ],
  "oneOffs": [{ "at": "2028-06", "amount": -5000, "name": "Dirt-bike trip" }],
  "events": [{ "template": "child", "params": {} }]
}
```
Rules: amounts are today's money; `steps` model pay scales; `oneOffs.amount` is signed; `events` are expanded into
`items`/`oneOffs` by `src/engine/events.js` (T1.3) before projection. Currency conversion happens before the engine
(T1.2) so the engine only ever sees one base currency.

## Event templates (parameters the editor must expose)
- `speedbirdPathway`: courseStart (default 2027-09), trainingMonths (18), reducedScaleYears (5), salarySteps[] (**user input**), trainingCosts[] (**user input**).
- `child`: birth date, annual running cost curve by age band, optional school: fromAge, toAge, annualFee.
- `houseDeposit`: date, amount, optional mortgage payment stream.
- `holiday`: times per year, cost each, from/to.
- `car`: purchase date/cost, running cost.
- `oneOffTrip`: date, cost.
- `relocation`: date, destination currency, cost-of-living change %, one-off cost.

## Honesty requirements (UI)
Always show: "Today's money", the assumptions in use, ranges not single numbers, and "Estimates, not advice".
Anything from research (not the user) carries an *estimate* tag and a source link in its tooltip.
