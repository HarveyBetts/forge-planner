// Forge onboarding question bank — the questions asked on first launch.
// Pure data + tiny helpers. No DOM. Numbering (n) matches the "Forge intake" doc so answers
// given there by number can be entered here. ★ (star) = the Quick start set.
//
// Types and stored value shapes:
//   text / longtext -> string            number / percent -> number
//   month -> 'YYYY-MM'                    choice -> string (an option value)
//   multi -> string[]                     scale -> 1..5 (labels: [low, high])
//   money -> { amount:number, currency:'GBP'|'AUD' }   (per: 'mo' | 'yr' | 'wk' | 'once')
//   fields -> { [key]: value-of-sub-type }  (sub-types: text, number, percent, month, money, choice)
// `when(answers)` hides a question unless it returns true. Use v(answers, id) to read a value.

export const SECTIONS = [
  { id: 'A', title: 'You and your timeline' },
  { id: 'B', title: 'The pilot pathway' },
  { id: 'C', title: 'Income today' },
  { id: 'D', title: 'Spending today' },
  { id: 'E', title: 'Savings and investments' },
  { id: 'F', title: 'Pension and retirement income' },
  { id: 'G', title: 'Partner and family' },
  { id: 'H', title: 'Kids and private school' },
  { id: 'I', title: 'Home' },
  { id: 'J', title: 'Cars and vehicles' },
  { id: 'K', title: 'Lifestyle and holidays' },
  { id: 'L', title: 'Protection' },
  { id: 'M', title: 'The app itself' },
  { id: 'N', title: 'Building it' },
];

export const CURRENCIES = [
  { v: 'GBP', l: '£', name: 'Pounds' },
  { v: 'AUD', l: 'A$', name: 'Aussie dollars' },
];

// Read an answer's value (undefined when unanswered or marked "don't know").
export function v(answers, id) {
  const rec = answers && answers[id];
  if (!rec || rec.unknown) return undefined;
  return rec.v;
}

const YN = ['Yes', 'No'];
const YNM = ['Yes', 'No', 'Maybe'];
const YNS = ['Yes', 'No', 'Not sure'];
const has = (x) => x !== undefined && x !== null && x !== '';
const kidsCount = (a) => { const k = v(a, 'q74'); return k && Number.isFinite(k.count) ? k.count : undefined; };
const mayHaveKids = (a) => kidsCount(a) === undefined || kidsCount(a) > 0;
const privateSchool = (a) => mayHaveKids(a) && v(a, 'q79') !== 'No';
const buying = (a) => v(a, 'q94') !== 'Rent long-term';
const doingSpeedbird = (a) => v(a, 'q11') !== 'Not doing it';

const Q = (n, section, type, text, extra = {}) => ({ id: 'q' + n, n, section, type, text, ...extra });

export const QUESTIONS = [
  // ---------------- A. You and your timeline ----------------
  Q(1, 'A', 'month', "What’s your date of birth?", { star: true, help: 'Month and year is enough.', map: 'birth' }),
  Q(2, 'A', 'choice', 'Long term, where do you see yourself living?', { opts: ['Stay in Australia', 'Come back to the UK', 'Undecided'] }),
  Q(3, 'A', 'fields', "If you’re coming back to the UK, roughly when and where?", {
    star: true, when: (a) => v(a, 'q2') !== 'Stay in Australia',
    fields: [{ k: 'when', type: 'month', label: 'Roughly when' }, { k: 'where', type: 'text', label: 'Where (town or county)' }],
  }),
  Q(4, 'A', 'number', 'At what age do you want to stop needing to work?', { star: true, unit: 'age', min: 30, max: 80, map: 'retirementAge' }),
  Q(5, 'A', 'choice', 'Would you still do some work after that?', { opts: ['No, fully stop', 'Some part-time flying', 'Karting or motorsport work', 'My own business', 'Not sure'] }),
  Q(6, 'A', 'longtext', 'What does a good week look like in retirement?'),
  Q(7, 'A', 'choice', 'Which currency should Forge show by default?', {
    star: true, opts: [{ v: 'GBP', l: '£ Pounds' }, { v: 'AUD', l: 'A$ Aussie dollars' }], map: 'baseCurrency',
    help: 'You can still enter any amount in either currency.',
  }),
  Q(8, 'A', 'choice', 'Where do you picture spending retirement?', { opts: ['UK', 'Australia', 'Split between both', 'Somewhere else'] }),
  Q(9, 'A', 'longtext', "What’s your biggest financial fear?"),
  Q(10, 'A', 'text', 'In one sentence, what does "financially free" mean to you?'),

  // ---------------- B. The pilot pathway ----------------
  Q(11, 'B', 'choice', 'Where are you in the Speedbird process right now?', {
    star: true, opts: ['Offer accepted', 'Offer received, not accepted yet', 'Still in selection', 'Not doing it'],
  }),
  Q(12, 'B', 'month', 'When does your course start?', {
    star: true, when: doingSpeedbird, help: 'Use your best estimate if it is not confirmed.', map: 'courseStart',
  }),
  Q(13, 'B', 'multi', 'How will you fund training?', {
    star: true, when: doingSpeedbird, opts: ['Own savings', 'Loan', 'Family help', 'Deferred or airline-funded', 'Not sure yet'],
  }),
  Q(14, 'B', 'fields', 'What will training cost?', {
    when: doingSpeedbird,
    fields: [{ k: 'total', type: 'money', per: 'once', label: 'Total cost' }, { k: 'youPay', type: 'money', per: 'once', label: 'Amount you pay yourself' }],
  }),
  Q(15, 'B', 'fields', 'Tell me about the training loan.', {
    when: (a) => doingSpeedbird(a) && (v(a, 'q13') || []).includes('Loan'),
    fields: [
      { k: 'amount', type: 'money', per: 'once', label: 'Loan amount' },
      { k: 'rate', type: 'percent', label: 'Interest rate (%)' },
      { k: 'start', type: 'month', label: 'Repayments start' },
      { k: 'years', type: 'number', label: 'Term (years)' },
    ],
  }),
  Q(16, 'B', 'choice', 'Will you have any income during training?', {
    star: true, when: doingSpeedbird, opts: ['No income', 'Some part-time work', 'An allowance or stipend', 'Not sure'],
  }),
  Q(17, 'B', 'longtext', 'Which pay figures do you have in writing? Paste them exactly as written.', {
    star: true, when: doingSpeedbird,
    help: 'Training allowance, reduced scale, First Officer scale. Forge never invents pay figures.',
  }),
  Q(18, 'B', 'number', 'How many years on the reduced scale before the main scale?', { when: doingSpeedbird, unit: 'years', min: 0, max: 15 }),
  Q(19, 'B', 'text', 'Which base or airline do you expect, and would it change where you live?', { when: doingSpeedbird }),
  Q(20, 'B', 'number', 'At what age do you expect to start as a First Officer?', { when: doingSpeedbird, unit: 'age', min: 18, max: 70 }),
  Q(21, 'B', 'fields', 'Should Forge model upgrading to Captain?', {
    when: doingSpeedbird,
    fields: [{ k: 'model', type: 'choice', opts: YN, label: 'Model it?' }, { k: 'age', type: 'number', label: 'Roughly at what age' }],
  }),
  Q(22, 'B', 'longtext', 'What do you know about the airline pension so far?', { when: doingSpeedbird, help: 'Employer contribution, scheme type. "Nothing yet" is fine.' }),
  Q(23, 'B', 'choice', 'Will you take out loss-of-licence or medical insurance?', { when: doingSpeedbird, opts: YNS }),
  Q(24, 'B', 'longtext', "What’s your Plan B if the pilot route is delayed or doesn’t happen? Should Forge model it?", { star: true }),

  // ---------------- C. Income today ----------------
  Q(25, 'C', 'money', "What’s your take-home pay per month, after tax?", { star: true, per: 'mo' }),
  Q(26, 'C', 'choice', 'How are you employed right now?', { opts: ['Casual', 'Part-time', 'Full-time', 'About to change'] }),
  Q(27, 'C', 'choice', 'How often are you paid?', { opts: ['Weekly', 'Fortnightly', 'Monthly'], help: 'Budgeting can follow your pay cycle.' }),
  Q(28, 'C', 'fields', 'Any side income?', {
    fields: [{ k: 'what', type: 'text', label: 'What from' }, { k: 'amount', type: 'money', per: 'mo', label: 'Per month' }],
  }),
  Q(29, 'C', 'choice', 'Will you keep working in karting while you train?', { opts: YNM }),
  Q(30, 'C', 'percent', 'What yearly pay rise do you expect over the next three years?', { unit: '% a year', min: 0, max: 50 }),
  Q(31, 'C', 'choice', 'Do bonuses, overtime or time off in lieu matter enough to model?', { opts: YN }),
  Q(32, 'C', 'choice', 'Enter take-home pay, or have Forge estimate tax?', { star: true, opts: ['I’ll enter take-home', 'Estimate tax for me'] }),
  Q(33, 'C', 'money', "Is there a partner’s take-home pay to include?", { per: 'mo', help: 'Skip if not.' }),
  Q(34, 'C', 'choice', 'How do you prefer to enter income?', { opts: ['Monthly', 'Fortnightly', 'Yearly'] }),

  // ---------------- D. Spending today ----------------
  Q(35, 'D', 'money', 'Roughly what do you spend per month in total right now?', { star: true, per: 'mo' }),
  Q(36, 'D', 'money', "What’s your rent or housing cost?", { per: 'mo' }),
  Q(37, 'D', 'longtext', 'What are your biggest recurring costs?', { help: 'Subscriptions, bike, insurance, phone…' }),
  Q(38, 'D', 'money', 'What do you spend on motorbikes and dirt bikes per year?', { per: 'yr', help: 'Running costs and upgrades.' }),
  Q(39, 'D', 'money', 'What do you spend on food and eating out?', { per: 'mo' }),
  Q(40, 'D', 'longtext', 'What spending feels like waste to you?'),
  Q(41, 'D', 'longtext', 'What spending would you refuse to cut, whatever the plan says?'),
  Q(42, 'D', 'choice', 'How do you track spending today?', { opts: ['Forge', 'A spreadsheet', 'My bank app', 'Nothing'] }),
  Q(43, 'D', 'choice', 'Which budget style suits you?', { opts: ['Strict categories', 'Loose guardrails', 'Just show me my free money'] }),
  Q(44, 'D', 'choice', 'Budget weekly, fortnightly or monthly?', { opts: ['Weekly', 'Fortnightly', 'Monthly'] }),
  Q(45, 'D', 'longtext', 'Any debts? List balances and interest rates.', { help: 'Cards, loans, car finance, student loan. "None" is fine.' }),
  Q(46, 'D', 'money', 'Do you send money to family regularly?', { per: 'mo' }),
  Q(47, 'D', 'choice', 'How loudly should Forge flag overspending?', { opts: ['Don’t flag it', 'Quietly', 'A nudge', 'Loud and clear'] }),
  Q(48, 'D', 'number', 'How many months of spending do you want as an emergency fund?', { star: true, unit: 'months', min: 0, max: 36 }),

  // ---------------- E. Savings and investments ----------------
  Q(49, 'E', 'fields', 'What are your current balances?', {
    star: true, help: 'Rough numbers are fine. Leave blank what you don’t have.', map: 'openingPot',
    fields: [
      { k: 'cashGBP', type: 'money', per: 'once', currency: 'GBP', label: 'Cash (£)' },
      { k: 'cashAUD', type: 'money', per: 'once', currency: 'AUD', label: 'Cash (A$)' },
      { k: 'isa', type: 'money', per: 'once', currency: 'GBP', label: 'Stocks ISA' },
      { k: 'super', type: 'money', per: 'once', currency: 'AUD', label: 'Australian super' },
      { k: 'other', type: 'money', per: 'once', label: 'Anything else' },
    ],
  }),
  Q(50, 'E', 'fields', 'How much will you invest each month?', {
    star: true, map: 'investing',
    fields: [
      { k: 'now', type: 'money', per: 'mo', label: 'Now' },
      { k: 'training', type: 'money', per: 'mo', label: 'During training' },
      { k: 'fo', type: 'money', per: 'mo', label: 'As a First Officer' },
    ],
  }),
  Q(51, 'E', 'choice', 'Is the ISA plan still VUSA as the core, plus other ETFs and about 10% individual stocks?', { opts: ['Yes', 'Mostly, with changes', 'No, rethinking it'] }),
  Q(52, 'E', 'multi', 'Do you hold anything outside an ISA?', { opts: ['General investment account', 'Crypto', 'Property', 'Premium Bonds', 'Nothing else'] }),
  Q(53, 'E', 'choice', 'Keep paying into Australian super, or let it sit?', { opts: ['Keep contributing', 'Let it sit', 'Not sure'] }),
  Q(54, 'E', 'choice', 'What will you do with your super when you move?', { opts: ['Leave it in Australia', 'Try to transfer it to the UK', 'Not sure'] }),
  Q(55, 'E', 'choice', 'What investment return are you comfortable planning on?', {
    opts: ['Cautious (4% a year)', 'Middle (7% a year)', 'Optimistic (9% a year)'], map: 'nominalReturn',
    help: 'Before inflation. Forge always shows all three as a range.',
  }),
  Q(56, 'E', 'scale', 'If your investments fell 30% in a year, how would you feel?', { labels: ['I’d panic and sell', 'I’d buy more'] }),
  Q(57, 'E', 'choice', 'Once you’re on track: spend more now, or keep investing until you’re certain?', {
    star: true, opts: ['Spend more now once on track', 'Somewhere in between', 'Keep investing until certain'], map: 'redirectAfterCoast',
  }),
  Q(58, 'E', 'fields', 'Any lump sums coming in?', {
    help: 'Inheritance, a gift, selling a bike.',
    fields: [{ k: 'what', type: 'text', label: 'What' }, { k: 'amount', type: 'money', per: 'once', label: 'Amount' }, { k: 'when', type: 'month', label: 'When' }],
  }),
  Q(59, 'E', 'fields', 'Any big one-off purchases in the next two years?', {
    fields: [{ k: 'what', type: 'text', label: 'What' }, { k: 'amount', type: 'money', per: 'once', label: 'Amount' }, { k: 'when', type: 'month', label: 'When' }],
  }),
  Q(60, 'E', 'choice', 'Should Forge track your ISA allowance each tax year?', { opts: YN }),
  Q(61, 'E', 'multi', 'Which separate savings goals do you want?', { opts: ['House deposit', 'Trips', 'Car', 'Wedding', 'Emergency fund', 'None'] }),
  Q(62, 'E', 'choice', 'How often will you update your balances?', { opts: ['Weekly', 'Monthly', 'Quarterly'] }),

  // ---------------- F. Pension and retirement income ----------------
  Q(63, 'F', 'money', 'How much a year would feel like enough in retirement?', {
    star: true, per: 'yr', help: 'In today’s money: what it would buy now.', map: 'retirementSpend',
  }),
  Q(64, 'F', 'fields', 'Should Forge count a state pension?', {
    help: 'Default is no. Only enter an amount you have checked.',
    fields: [{ k: 'include', type: 'choice', opts: YN, label: 'Include it?' }, { k: 'amount', type: 'money', per: 'yr', label: 'Amount per year' }],
  }),
  Q(65, 'F', 'fields', 'Should Forge count an airline pension?', {
    fields: [{ k: 'include', type: 'choice', opts: ['Leave blank for now', 'Yes'], label: 'Include it?' }, { k: 'amount', type: 'money', per: 'yr', label: 'Amount per year' }],
  }),
  Q(66, 'F', 'choice', 'How much should you draw from your pot each year?', {
    opts: ['Cautious (3.5%)', 'Standard (4%)', 'Aggressive (5%)'], map: 'withdrawalRate',
    help: 'Lower is safer but needs a bigger pot.',
  }),
  Q(67, 'F', 'choice', 'Retire as early as possible, or at a set age?', { opts: ['As early as possible', 'At a set age'] }),
  Q(68, 'F', 'choice', 'Do you want to leave an inheritance for your kids?', { opts: ['Yes, a meaningful amount', 'A little', 'Not a priority'] }),
  Q(69, 'F', 'choice', 'Include a buffer for care and health costs in later life?', { opts: YNS }),
  Q(70, 'F', 'choice', 'Would you downsize your home to release money?', { opts: YNM }),

  // ---------------- G. Partner and family ----------------
  Q(71, 'G', 'choice', "Should a partner’s finances be in the plan?", { opts: ['Not yet', 'Yes, joint', 'Yes, kept separate'] }),
  Q(72, 'G', 'choice', 'Would a partner work after kids?', { when: (a) => has(v(a, 'q71')) && v(a, 'q71') !== 'Not yet', opts: ['Full-time', 'Part-time', 'Not working', 'Don’t know'] }),
  Q(73, 'G', 'fields', 'Should there be a wedding budget?', {
    fields: [{ k: 'amount', type: 'money', per: 'once', label: 'Budget' }, { k: 'when', type: 'month', label: 'Roughly when' }],
  }),
  Q(74, 'G', 'fields', 'How many kids do you want, and when?', {
    star: true, map: 'kids',
    fields: [
      { k: 'count', type: 'number', label: 'How many' },
      { k: 'ageFirst', type: 'number', label: 'Your age at the first' },
      { k: 'gap', type: 'number', label: 'Years between kids' },
    ],
  }),
  Q(75, 'G', 'choice', 'Model 0, 1, 2 and 3 kids as separate scenarios?', { opts: YN }),
  Q(76, 'G', 'number', 'How many months of reduced income should parental leave allow for?', { unit: 'months', min: 0, max: 36 }),
  Q(77, 'G', 'choice', 'Will you support your parents later in life?', { opts: YNM }),
  Q(78, 'G', 'multi', 'Who else should see this app?', { opts: ['A partner', 'A financial adviser', 'Nobody'] }),

  // ---------------- H. Kids and private school ----------------
  Q(79, 'H', 'choice', 'Is private school a definite, probable or nice-to-have?', {
    star: true, when: mayHaveKids, opts: ['Definite', 'Probable', 'Nice-to-have', 'No'], map: 'kids',
  }),
  Q(80, 'H', 'fields', 'Where, and day or boarding?', {
    star: true, when: privateSchool,
    fields: [
      { k: 'country', type: 'choice', opts: ['UK', 'Australia', 'Either'], label: 'Country' },
      { k: 'type', type: 'choice', opts: ['Day', 'Boarding', 'Either'], label: 'Type' },
    ],
  }),
  Q(81, 'H', 'choice', 'From what age?', {
    star: true, when: privateSchool, opts: ['Nursery (3)', 'Prep (4)', 'Senior (11)', 'Senior (13)'], map: 'kids',
  }),
  Q(82, 'H', 'money', 'What yearly fee per child should Forge plan for?', {
    star: true, when: privateSchool, per: 'yr', map: 'kids',
    help: 'Use a placeholder you’ll check later. Forge doesn’t guess fees.',
  }),
  Q(83, 'H', 'choice', 'Would scholarships or bursaries matter?', { when: privateSchool, opts: YNS }),
  Q(84, 'H', 'choice', 'Would you consider state primary, then private secondary?', { when: privateSchool, opts: YNM }),
  Q(85, 'H', 'money', 'Extras per child per year (uniform, trips, music, sport)?', { when: privateSchool, per: 'yr', map: 'kids' }),
  Q(86, 'H', 'money', 'Childcare per child before school age?', { when: mayHaveKids, per: 'mo', map: 'kids' }),
  Q(87, 'H', 'choice', 'Will you pay for university?', { when: mayHaveKids, opts: ['Fully', 'Partly', 'Not at all'] }),
  Q(88, 'H', 'multi', 'Will you help with any of these?', { when: mayHaveKids, opts: ['Their first car', 'Their first home', 'Neither'] }),
  Q(89, 'H', 'money', 'Pocket money per child?', { when: mayHaveKids, per: 'mo' }),
  Q(90, 'H', 'longtext', "Which of the kids’ hobbies would you fund?", { when: mayHaveKids, help: 'Flying, motorsport, anything.' }),
  Q(91, 'H', 'choice', 'A separate education fund per child?', { when: mayHaveKids, opts: YN }),
  Q(92, 'H', 'choice', 'Should school fees rise faster than general inflation?', { when: privateSchool, opts: ['Yes, assume faster', 'No, same as inflation'] }),
  Q(93, 'H', 'choice', 'Would you move house to be near a particular school?', { when: mayHaveKids, opts: YNM }),

  // ---------------- I. Home ----------------
  Q(94, 'I', 'choice', 'Do you want to buy or rent long-term?', { star: true, opts: ['Buy', 'Rent long-term', 'Not sure'] }),
  Q(95, 'I', 'text', 'Where do you want to live once settled?'),
  Q(96, 'I', 'longtext', 'What kind of home? Type, bedrooms, garden, new or old.'),
  Q(97, 'I', 'money', "What’s your target home price, in today’s money?", { star: true, when: buying, per: 'once', map: 'house' }),
  Q(98, 'I', 'fields', 'What deposit, and by when?', {
    star: true, when: buying, map: 'house',
    fields: [{ k: 'percent', type: 'percent', label: 'Deposit (%)' }, { k: 'by', type: 'month', label: 'By when' }],
  }),
  Q(99, 'I', 'fields', 'What mortgage would you be comfortable with?', {
    when: buying,
    fields: [{ k: 'years', type: 'number', label: 'Term (years)' }, { k: 'monthly', type: 'money', per: 'mo', label: 'Monthly payment' }],
  }),
  Q(100, 'I', 'choice', 'Include buying costs (stamp duty, legal fees, moving)?', { when: buying, opts: YN }),
  Q(101, 'I', 'money', 'Renovation and furnishing budget?', { when: buying, per: 'once' }),
  Q(102, 'I', 'choice', 'A garage or workshop for bikes?', { opts: ['Must have', 'Nice to have', 'Don’t need one'] }),
  Q(103, 'I', 'choice', 'Should your home count toward retirement?', { when: buying, opts: ['Yes, I’d downsize later', 'No, keep it separate'] }),
  Q(104, 'I', 'money', 'Home running costs (council tax, utilities)?', { per: 'mo' }),

  // ---------------- J. Cars and vehicles ----------------
  Q(105, 'J', 'fields', 'Dream cars, by life stage?', {
    star: true,
    fields: [{ k: 'now', type: 'text', label: 'Now' }, { k: 'fo', type: 'text', label: 'As a First Officer' }, { k: 'later', type: 'text', label: 'Later on' }],
  }),
  Q(106, 'J', 'fields', 'What do you drive now, and when will you replace it?', {
    fields: [{ k: 'what', type: 'text', label: 'Current car' }, { k: 'replace', type: 'month', label: 'Replace by' }],
  }),
  Q(107, 'J', 'money', 'Budget per car, in today’s prices?', { per: 'once', map: 'cars' }),
  Q(108, 'J', 'choice', 'Cash, finance or lease?', { opts: ['Cash', 'Finance', 'Lease', 'A mix'] }),
  Q(109, 'J', 'number', 'How many cars will the household have?', { unit: 'cars', min: 0, max: 6 }),
  Q(110, 'J', 'number', 'Change car every how many years?', { unit: 'years', min: 1, max: 20, map: 'cars' }),
  Q(111, 'J', 'money', 'Car running costs (fuel or charging, insurance, servicing)?', { per: 'mo' }),
  Q(112, 'J', 'fields', 'Which motorbikes do you want?', {
    fields: [{ k: 'which', type: 'text', label: 'Bikes' }, { k: 'budget', type: 'money', per: 'once', label: 'Budget' }],
  }),
  Q(113, 'J', 'fields', 'The dirt-bike trip: where, when and how much?', {
    star: true, map: 'trip',
    fields: [{ k: 'where', type: 'text', label: 'Where' }, { k: 'when', type: 'month', label: 'When' }, { k: 'cost', type: 'money', per: 'once', label: 'Cost' }],
  }),
  Q(114, 'J', 'money', 'Budget for track days, karting or flying for fun?', { per: 'yr' }),
  Q(115, 'J', 'choice', 'Treat cars as spending only, with no resale value?', { opts: ['Yes, spending only', 'Include resale value'] }),

  // ---------------- K. Lifestyle and holidays ----------------
  Q(116, 'K', 'fields', 'Family holidays: how often, how much, what standard?', {
    star: true, map: 'holidays',
    fields: [
      { k: 'perYear', type: 'number', label: 'Holidays per year' },
      { k: 'costEach', type: 'money', per: 'once', label: 'Cost each' },
      { k: 'standard', type: 'choice', opts: ['Budget', 'Comfort', 'Luxury'], label: 'Standard' },
      { k: 'where', type: 'text', label: 'Where' },
    ],
  }),
  Q(117, 'K', 'number', 'How many personal or couple holidays a year?', { unit: 'a year', min: 0, max: 12 }),
  Q(118, 'K', 'money', 'Dining out and entertainment?', { per: 'mo' }),
  Q(119, 'K', 'money', 'Fitness, running and gym?', { per: 'mo' }),
  Q(120, 'K', 'money', 'Gifts and charity?', { per: 'yr' }),
  Q(121, 'K', 'money', 'Clothes, watches and tech?', { per: 'yr' }),
  Q(122, 'K', 'longtext', 'Ten experiences to do before 40?'),
  Q(123, 'K', 'money', 'What “treat yourself” amount should never feel guilty?', { per: 'mo' }),
  Q(124, 'K', 'multi', 'Once you hit coast and money is free, what gets it first?', { opts: ['Holidays', 'Experiences', 'A car', 'The kids', 'The house', 'Giving', 'Keep investing anyway'] }),
  Q(125, 'K', 'longtext', 'What would you refuse to give up, even in the lean years?'),
  Q(126, 'K', 'longtext', 'Which sacrifices are you willing to make during training?'),

  // ---------------- L. Protection ----------------
  Q(127, 'L', 'multi', 'Which cover do you have or want?', { opts: ['Income protection', 'Life cover', 'Critical illness', 'None yet'] }),
  Q(128, 'L', 'choice', 'Private health insurance?', { opts: ['Yes, in Australia', 'Yes, in the UK', 'No'] }),

  // ---------------- M. The app itself ----------------
  Q(129, 'M', 'choice', 'Who is Forge for?', { star: true, opts: ['Just me', 'Me and a partner', 'Friends too', 'Eventually paying users'] }),
  Q(130, 'M', 'choice', 'What matters most in the app?', { opts: ['The planner', 'Budgeting', 'Timeline visuals', 'The AI'] }),
  Q(131, 'M', 'choice', 'Which screen would you open every day?', { opts: ['Plan', 'Timeline', 'Budget', 'Scenarios'] }),
  Q(132, 'M', 'choice', 'How often will you use it?', { opts: ['Daily', 'Weekly', 'Monthly'] }),
  Q(133, 'M', 'multi', 'Which notifications do you want?', { opts: ['Monthly check-in', 'When I fall behind', 'Bill reminders', 'None'] }),
  Q(134, 'M', 'choice', 'When you’re behind plan, how should Forge tell you?', { star: true, opts: ['Gently', 'Straight-talking', 'Bluntly'] }),
  Q(135, 'M', 'scale', 'How flashy should the animations be?', { labels: ['Subtle', 'Full show'] }),
  Q(136, 'M', 'choice', 'Light or dark?', { opts: ['Light', 'Dark', 'Follow my phone'] }),
  Q(137, 'M', 'choice', 'Home screen: one big number or a full dashboard?', { opts: ['One big number', 'Full dashboard'] }),
  Q(138, 'M', 'choice', 'Are the tab names right: Plan, Timeline, Budget, Scenarios, Settings?', { opts: ['Yes, keep them', 'I’d change them'] }),
  Q(139, 'M', 'choice', 'Bank data: is monthly CSV import fine?', { opts: ['CSV import is fine', 'I want live bank links later'] }),
  Q(140, 'M', 'choice', 'Where should your data live?', { star: true, opts: ['Cloud (phone and laptop)', 'This device only'] }),

  // ---------------- N. Building it ----------------
  Q(141, 'N', 'choice', 'Is a public code repo OK (free hosting)?', { opts: ['Public is fine', 'Keep it private'] }),
  Q(142, 'N', 'money', 'Most you’ll spend on Claude usage per week while it builds unattended?', { per: 'wk' }),
  Q(143, 'N', 'choice', 'Push straight to main, or open pull requests for you to approve?', { opts: ['Push straight to main', 'Open pull requests for me'] }),
  Q(144, 'N', 'choice', 'How often do you want build updates?', { opts: ['Daily summary', 'After each phase', 'Only when it’s blocked'] }),
  Q(145, 'N', 'longtext', 'What would make you want to stop the build?'),
  Q(146, 'N', 'month', 'Is there a deadline?', { help: 'For example, before the course starts. Skip if none.' }),
];

export const BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

// Option helpers: options may be strings or { v, l }.
export function optValue(o) { return typeof o === 'string' ? o : o.v; }
export function optLabel(o) { return typeof o === 'string' ? o : o.l; }
