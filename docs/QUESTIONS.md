# QUESTIONS — the onboarding question bank

> Generated from `src/onboarding/questions.js` by `npm run docs:questions`. Do not edit by hand.

146 questions · ★ = Quick start (32) · ⤷ = only shown when an earlier answer makes it relevant · → = feeds the plan

## A. You and your timeline

| # | Question | Answer type | |
|---|---|---|---|
| 1 | What’s your date of birth? | month | ★ → birth |
| 2 | Long term, where do you see yourself living? | pick one: Stay in Australia / Come back to the UK / Undecided |  |
| 3 | If you’re coming back to the UK, roughly when and where? | boxes: Roughly when (month), Where (town or county) (text) | ★ ⤷ |
| 4 | At what age do you want to stop needing to work? | number (age) | ★ → retirementAge |
| 5 | Would you still do some work after that? | pick one: No, fully stop / Some part-time flying / Karting or motorsport work / My own business / Not sure |  |
| 6 | What does a good week look like in retirement? | longtext |  |
| 7 | Which currency should Forge show by default? | pick one: £ Pounds / A$ Aussie dollars | ★ → baseCurrency |
| 8 | Where do you picture spending retirement? | pick one: UK / Australia / Split between both / Somewhere else |  |
| 9 | What’s your biggest financial fear? | longtext |  |
| 10 | In one sentence, what does "financially free" mean to you? | text |  |

## B. The pilot pathway

| # | Question | Answer type | |
|---|---|---|---|
| 11 | Where are you in the Speedbird process right now? | pick one: Offer accepted / Offer received, not accepted yet / Still in selection / Not doing it | ★ |
| 12 | When does your course start? | month | ★ ⤷ → courseStart |
| 13 | How will you fund training? | pick any: Own savings / Loan / Family help / Deferred or airline-funded / Not sure yet | ★ ⤷ |
| 14 | What will training cost? | boxes: Total cost (money), Amount you pay yourself (money) | ⤷ |
| 15 | Tell me about the training loan. | boxes: Loan amount (money), Interest rate (%) (percent), Repayments start (month), Term (years) (number) | ⤷ |
| 16 | Will you have any income during training? | pick one: No income / Some part-time work / An allowance or stipend / Not sure | ★ ⤷ |
| 17 | Which pay figures do you have in writing? Paste them exactly as written. | longtext | ★ ⤷ |
| 18 | How many years on the reduced scale before the main scale? | number (years) | ⤷ |
| 19 | Which base or airline do you expect, and would it change where you live? | text | ⤷ |
| 20 | At what age do you expect to start as a First Officer? | number (age) | ⤷ |
| 21 | Should Forge model upgrading to Captain? | boxes: Model it? (choice), Roughly at what age (number) | ⤷ |
| 22 | What do you know about the airline pension so far? | longtext | ⤷ |
| 23 | Will you take out loss-of-licence or medical insurance? | pick one: Yes / No / Not sure | ⤷ |
| 24 | What’s your Plan B if the pilot route is delayed or doesn’t happen? Should Forge model it? | longtext | ★ |

## C. Income today

| # | Question | Answer type | |
|---|---|---|---|
| 25 | What’s your take-home pay per month, after tax? | money /month | ★ |
| 26 | How are you employed right now? | pick one: Casual / Part-time / Full-time / About to change |  |
| 27 | How often are you paid? | pick one: Weekly / Fortnightly / Monthly |  |
| 28 | Any side income? | boxes: What from (text), Per month (money) |  |
| 29 | Will you keep working in karting while you train? | pick one: Yes / No / Maybe |  |
| 30 | What yearly pay rise do you expect over the next three years? | percent (% a year) |  |
| 31 | Do bonuses, overtime or time off in lieu matter enough to model? | pick one: Yes / No |  |
| 32 | Enter take-home pay, or have Forge estimate tax? | pick one: I’ll enter take-home / Estimate tax for me | ★ |
| 33 | Is there a partner’s take-home pay to include? | money /month |  |
| 34 | How do you prefer to enter income? | pick one: Monthly / Fortnightly / Yearly |  |

## D. Spending today

| # | Question | Answer type | |
|---|---|---|---|
| 35 | Roughly what do you spend per month in total right now? | money /month | ★ |
| 36 | What’s your rent or housing cost? | money /month |  |
| 37 | What are your biggest recurring costs? | longtext |  |
| 38 | What do you spend on motorbikes and dirt bikes per year? | money /year |  |
| 39 | What do you spend on food and eating out? | money /month |  |
| 40 | What spending feels like waste to you? | longtext |  |
| 41 | What spending would you refuse to cut, whatever the plan says? | longtext |  |
| 42 | How do you track spending today? | pick one: Forge / A spreadsheet / My bank app / Nothing |  |
| 43 | Which budget style suits you? | pick one: Strict categories / Loose guardrails / Just show me my free money |  |
| 44 | Budget weekly, fortnightly or monthly? | pick one: Weekly / Fortnightly / Monthly |  |
| 45 | Any debts? List balances and interest rates. | longtext |  |
| 46 | Do you send money to family regularly? | money /month |  |
| 47 | How loudly should Forge flag overspending? | pick one: Don’t flag it / Quietly / A nudge / Loud and clear |  |
| 48 | How many months of spending do you want as an emergency fund? | number (months) | ★ |

## E. Savings and investments

| # | Question | Answer type | |
|---|---|---|---|
| 49 | What are your current balances? | boxes: Cash (£) (money), Cash (A$) (money), Stocks ISA (money), Australian super (money), Anything else (money) | ★ → openingPot |
| 50 | How much will you invest each month? | boxes: Now (money), During training (money), As a First Officer (money) | ★ → investing |
| 51 | Is the ISA plan still VUSA as the core, plus other ETFs and about 10% individual stocks? | pick one: Yes / Mostly, with changes / No, rethinking it |  |
| 52 | Do you hold anything outside an ISA? | pick any: General investment account / Crypto / Property / Premium Bonds / Nothing else |  |
| 53 | Keep paying into Australian super, or let it sit? | pick one: Keep contributing / Let it sit / Not sure |  |
| 54 | What will you do with your super when you move? | pick one: Leave it in Australia / Try to transfer it to the UK / Not sure |  |
| 55 | What investment return are you comfortable planning on? | pick one: Cautious (4% a year) / Middle (7% a year) / Optimistic (9% a year) | → nominalReturn |
| 56 | If your investments fell 30% in a year, how would you feel? | scale 1–5: I’d panic and sell → I’d buy more |  |
| 57 | Once you’re on track: spend more now, or keep investing until you’re certain? | pick one: Spend more now once on track / Somewhere in between / Keep investing until certain | ★ → redirectAfterCoast |
| 58 | Any lump sums coming in? | boxes: What (text), Amount (money), When (month) |  |
| 59 | Any big one-off purchases in the next two years? | boxes: What (text), Amount (money), When (month) |  |
| 60 | Should Forge track your ISA allowance each tax year? | pick one: Yes / No |  |
| 61 | Which separate savings goals do you want? | pick any: House deposit / Trips / Car / Wedding / Emergency fund / None |  |
| 62 | How often will you update your balances? | pick one: Weekly / Monthly / Quarterly |  |

## F. Pension and retirement income

| # | Question | Answer type | |
|---|---|---|---|
| 63 | How much a year would feel like enough in retirement? | money /year | ★ → retirementSpend |
| 64 | Should Forge count a state pension? | boxes: Include it? (choice), Amount per year (money) |  |
| 65 | Should Forge count an airline pension? | boxes: Include it? (choice), Amount per year (money) |  |
| 66 | How much should you draw from your pot each year? | pick one: Cautious (3.5%) / Standard (4%) / Aggressive (5%) | → withdrawalRate |
| 67 | Retire as early as possible, or at a set age? | pick one: As early as possible / At a set age |  |
| 68 | Do you want to leave an inheritance for your kids? | pick one: Yes, a meaningful amount / A little / Not a priority |  |
| 69 | Include a buffer for care and health costs in later life? | pick one: Yes / No / Not sure |  |
| 70 | Would you downsize your home to release money? | pick one: Yes / No / Maybe |  |

## G. Partner and family

| # | Question | Answer type | |
|---|---|---|---|
| 71 | Should a partner’s finances be in the plan? | pick one: Not yet / Yes, joint / Yes, kept separate |  |
| 72 | Would a partner work after kids? | pick one: Full-time / Part-time / Not working / Don’t know | ⤷ |
| 73 | Should there be a wedding budget? | boxes: Budget (money), Roughly when (month) |  |
| 74 | How many kids do you want, and when? | boxes: How many (number), Your age at the first (number), Years between kids (number) | ★ → kids |
| 75 | Model 0, 1, 2 and 3 kids as separate scenarios? | pick one: Yes / No |  |
| 76 | How many months of reduced income should parental leave allow for? | number (months) |  |
| 77 | Will you support your parents later in life? | pick one: Yes / No / Maybe |  |
| 78 | Who else should see this app? | pick any: A partner / A financial adviser / Nobody |  |

## H. Kids and private school

| # | Question | Answer type | |
|---|---|---|---|
| 79 | Is private school a definite, probable or nice-to-have? | pick one: Definite / Probable / Nice-to-have / No | ★ ⤷ → kids |
| 80 | Where, and day or boarding? | boxes: Country (choice), Type (choice) | ★ ⤷ |
| 81 | From what age? | pick one: Nursery (3) / Prep (4) / Senior (11) / Senior (13) | ★ ⤷ → kids |
| 82 | What yearly fee per child should Forge plan for? | money /year | ★ ⤷ → kids |
| 83 | Would scholarships or bursaries matter? | pick one: Yes / No / Not sure | ⤷ |
| 84 | Would you consider state primary, then private secondary? | pick one: Yes / No / Maybe | ⤷ |
| 85 | Extras per child per year (uniform, trips, music, sport)? | money /year | ⤷ → kids |
| 86 | Childcare per child before school age? | money /month | ⤷ → kids |
| 87 | Will you pay for university? | pick one: Fully / Partly / Not at all | ⤷ |
| 88 | Will you help with any of these? | pick any: Their first car / Their first home / Neither | ⤷ |
| 89 | Pocket money per child? | money /month | ⤷ |
| 90 | Which of the kids’ hobbies would you fund? | longtext | ⤷ |
| 91 | A separate education fund per child? | pick one: Yes / No | ⤷ |
| 92 | Should school fees rise faster than general inflation? | pick one: Yes, assume faster / No, same as inflation | ⤷ |
| 93 | Would you move house to be near a particular school? | pick one: Yes / No / Maybe | ⤷ |

## I. Home

| # | Question | Answer type | |
|---|---|---|---|
| 94 | Do you want to buy or rent long-term? | pick one: Buy / Rent long-term / Not sure | ★ |
| 95 | Where do you want to live once settled? | text |  |
| 96 | What kind of home? Type, bedrooms, garden, new or old. | longtext |  |
| 97 | What’s your target home price, in today’s money? | money one-off | ★ ⤷ → house |
| 98 | What deposit, and by when? | boxes: Deposit (%) (percent), By when (month) | ★ ⤷ → house |
| 99 | What mortgage would you be comfortable with? | boxes: Term (years) (number), Monthly payment (money) | ⤷ |
| 100 | Include buying costs (stamp duty, legal fees, moving)? | pick one: Yes / No | ⤷ |
| 101 | Renovation and furnishing budget? | money one-off | ⤷ |
| 102 | A garage or workshop for bikes? | pick one: Must have / Nice to have / Don’t need one |  |
| 103 | Should your home count toward retirement? | pick one: Yes, I’d downsize later / No, keep it separate | ⤷ |
| 104 | Home running costs (council tax, utilities)? | money /month |  |

## J. Cars and vehicles

| # | Question | Answer type | |
|---|---|---|---|
| 105 | Dream cars, by life stage? | boxes: Now (text), As a First Officer (text), Later on (text) | ★ |
| 106 | What do you drive now, and when will you replace it? | boxes: Current car (text), Replace by (month) |  |
| 107 | Budget per car, in today’s prices? | money one-off | → cars |
| 108 | Cash, finance or lease? | pick one: Cash / Finance / Lease / A mix |  |
| 109 | How many cars will the household have? | number (cars) |  |
| 110 | Change car every how many years? | number (years) | → cars |
| 111 | Car running costs (fuel or charging, insurance, servicing)? | money /month |  |
| 112 | Which motorbikes do you want? | boxes: Bikes (text), Budget (money) |  |
| 113 | The dirt-bike trip: where, when and how much? | boxes: Where (text), When (month), Cost (money) | ★ → trip |
| 114 | Budget for track days, karting or flying for fun? | money /year |  |
| 115 | Treat cars as spending only, with no resale value? | pick one: Yes, spending only / Include resale value |  |

## K. Lifestyle and holidays

| # | Question | Answer type | |
|---|---|---|---|
| 116 | Family holidays: how often, how much, what standard? | boxes: Holidays per year (number), Cost each (money), Standard (choice), Where (text) | ★ → holidays |
| 117 | How many personal or couple holidays a year? | number (a year) |  |
| 118 | Dining out and entertainment? | money /month |  |
| 119 | Fitness, running and gym? | money /month |  |
| 120 | Gifts and charity? | money /year |  |
| 121 | Clothes, watches and tech? | money /year |  |
| 122 | Ten experiences to do before 40? | longtext |  |
| 123 | What “treat yourself” amount should never feel guilty? | money /month |  |
| 124 | Once you hit coast and money is free, what gets it first? | pick any: Holidays / Experiences / A car / The kids / The house / Giving / Keep investing anyway |  |
| 125 | What would you refuse to give up, even in the lean years? | longtext |  |
| 126 | Which sacrifices are you willing to make during training? | longtext |  |

## L. Protection

| # | Question | Answer type | |
|---|---|---|---|
| 127 | Which cover do you have or want? | pick any: Income protection / Life cover / Critical illness / None yet |  |
| 128 | Private health insurance? | pick one: Yes, in Australia / Yes, in the UK / No |  |

## M. The app itself

| # | Question | Answer type | |
|---|---|---|---|
| 129 | Who is Forge for? | pick one: Just me / Me and a partner / Friends too / Eventually paying users | ★ |
| 130 | What matters most in the app? | pick one: The planner / Budgeting / Timeline visuals / The AI |  |
| 131 | Which screen would you open every day? | pick one: Plan / Timeline / Budget / Scenarios |  |
| 132 | How often will you use it? | pick one: Daily / Weekly / Monthly |  |
| 133 | Which notifications do you want? | pick any: Monthly check-in / When I fall behind / Bill reminders / None |  |
| 134 | When you’re behind plan, how should Forge tell you? | pick one: Gently / Straight-talking / Bluntly | ★ |
| 135 | How flashy should the animations be? | scale 1–5: Subtle → Full show |  |
| 136 | Light or dark? | pick one: Light / Dark / Follow my phone |  |
| 137 | Home screen: one big number or a full dashboard? | pick one: One big number / Full dashboard |  |
| 138 | Are the tab names right: Plan, Timeline, Budget, Scenarios, Settings? | pick one: Yes, keep them / I’d change them |  |
| 139 | Bank data: is monthly CSV import fine? | pick one: CSV import is fine / I want live bank links later |  |
| 140 | Where should your data live? | pick one: Cloud (phone and laptop) / This device only | ★ |

## N. Building it

| # | Question | Answer type | |
|---|---|---|---|
| 141 | Is a public code repo OK (free hosting)? | pick one: Public is fine / Keep it private |  |
| 142 | Most you’ll spend on Claude usage per week while it builds unattended? | money /week |  |
| 143 | Push straight to main, or open pull requests for you to approve? | pick one: Push straight to main / Open pull requests for me |  |
| 144 | How often do you want build updates? | pick one: Daily summary / After each phase / Only when it’s blocked |  |
| 145 | What would make you want to stop the build? | longtext |  |
| 146 | Is there a deadline? | month |  |

