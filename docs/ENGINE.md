# ENGINE — maths, conventions, test vectors

## Conventions
- **Real terms.** Every amount is in today's money; growth uses `realRate = (1+nominal)/(1+inflation)−1`.
- **Monthly steps.** `rm = (1+realRate)^(1/12) − 1`. Per month: grow the opening pot, then add that month's net flow.
- **Net flow** = Σ income items − Σ expense items + signed one-offs for that month. Positive flow is split by
  `investShare` (rest is "freed"); negative flow is drawn from the pot.
- **Retirement month** = birth month + `retirementAge × 12`. Rows run start → retirement inclusive.
- **Coast number at month m** = target / (1+realRate)^(yearsLeft). A month is "coasting" when the pot ≥ that number.
  With `redirectAfterCoast`, positive flow after coasting is not invested (it's freed).

## Formulas
```
target        = max(0, spend − otherIncome) / withdrawalRate
coastNumber   = target / (1 + r)^years
futureValue   = pv · (1 + r)^years
impliedRate   = (fv / pv)^(1/years) − 1
```

## Sanity check against the Instagram post (encoded as a test)
$715k → $4.3M over 26 years implies **≈7.1% a year nominal**, with no inflation adjustment. $4.3M in 2052 buys far
less than $4.3M today. Their $202k/yr from $4.3M is a **≈4.7%** withdrawal rate — above the commonly quoted 4%
rule of thumb (which itself comes from US historical data and is not a guarantee). Forge must let Harvey flex
return, inflation and withdrawal rate and always show low/mid/high.

## Known limits (be honest in the UI)
No sequence-of-returns risk, no tax, no fees, no currency risk beyond a user-chosen base currency, constant real
return. Treat results as planning ranges. Tax/pension/super rules (UK and Australia) must be researched and cited
before being modelled (T1.2) — never typed from memory.

## Test vectors (already in `tests/engine.test.js`)
realRate(0.07, 0.025)=0.0439024 · impliedRate(715000, 4.3e6, 26)≈0.0714 · targetPot(200k, 4%)=5.0M ·
coastNumber round-trips to target · zero-return projections sum flows exactly · pay steps · signed one-offs ·
investShare/freed split · redirectAfterCoast · solver hits target within 0.1%.
