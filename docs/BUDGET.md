# BUDGET — how the Budget tab works (built from Harvey's own spreadsheet, D23)

## The model (`src/budget/`)
| Spreadsheet | App |
|---|---|
| BUDGET sheet: one row per week (Mon–Sun), INCOME + one column per category, TOTAL = row sum | `ledger.js`: `entries[weekMonday][categoryId]` = signed amount (money in +, out −); `weekRow()` |
| "Current" balance | `openingCash` (in the budget currency, A$) from the first week |
| Fortnightly "At End" table (A$ running balance; pay lands two weeks after it's earned) | `cashForecast()` / `forecastBy(…, 2)` with `payLagWeeks: 2` — matches the sheet's own numbers to the cent |
| Bill names with due days ("14th", "4th May") | `bills` + `upcomingBills()` |
| "Premium Bonds Total" (£) | `extras` (counted in net worth, converted at live rates) |
| INVESTMENTS sheet: purchase lots (ticker, quantity, price, cost £) + per-ticker table with Google's live price | `investments.js`: `holdings()` — shares, cost, average cost, value, gain £/%. Prices come from the file (Google's last cached price) or are typed in. US$/€ use live FX; pence (GBX) handled |
| Total in £ = A$ × typed exchange rate + bonds + investments | `view.js` `netWorth()` in the plan's base currency at live mid-market rates |

## Importing (`xlsx.js` + `importsheet.js`)
Budget tab → **Import my spreadsheet** → pick the .xlsx. It's read **on the phone** (no upload, no libraries): the zip is opened
with the browser's own `DecompressionStream`, cells are read (including the cached results of formulas), and everything is found
by its **headings** (DATE / INCOME / … / TOTAL, "Current", "Premium Bonds Total", TICKER / FILLED QTY / AMOUNT / COST (£),
TICKER / COMPANY / CURRENCY / LIVE PRICE), so added rows and columns still work. A **Check your import** screen shows what came
across and any warnings; nothing is saved until **Save to my budget**. Re-importing replaces the budget on the phone.

From Google Sheets: File → Download → Microsoft Excel (.xlsx), then pick that file in Forge (Files app on the iPhone).

## Using it
- **Money**: net worth today; the week (type what you spent — a refund starts with +); cash by fortnight; bills coming up.
- **Investments**: holdings with value and gain; tap one to update its price; add a purchase.
- **Use these as my current balances** writes cash (A$), Premium Bonds (£ cash) and investments (Stocks ISA) into the plan's
  question 49 after showing what it changes. Super and "anything else" are left alone.

## Privacy
The workbook and its numbers never go into git, logs or any server. Tests use a made-up workbook with the same layout
(`tests/fixtures/xlsx-fixture.js`).
