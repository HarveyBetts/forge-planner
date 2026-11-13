// App settings derived from onboarding answers (T2.2c). PURE except applyTheme().
// Later (T2.8) saved overrides from the store are layered on top: { ...settingsFromAnswers(a), ...saved }.
import { v } from '../onboarding/questions.js';

const THEME = { Light: 'light', Dark: 'dark', 'Follow my phone': 'system' };
const TONE = { Gently: 'gentle', 'Straight-talking': 'straight', Bluntly: 'blunt' };
const STYLE = { 'Strict categories': 'strict', 'Loose guardrails': 'loose', 'Just show me my free money': 'free' };
const PERIOD = { Weekly: 'weekly', Fortnightly: 'fortnightly', Monthly: 'monthly' };
const OVERSPEND = { 'Don’t flag it': 'off', Quietly: 'quiet', 'A nudge': 'nudge', 'Loud and clear': 'loud' };
const NOTIFY = { 'Monthly check-in': 'checkin', 'When I fall behind': 'behind', 'Bill reminders': 'bills' };

export const DEFAULT_SETTINGS = {
  theme: 'system', tone: 'straight',
  budget: { style: 'loose', period: 'monthly', periodFrom: 'default' },
  overspend: 'nudge', notifications: [],
};

export function settingsFromAnswers(answers) {
  const a = answers || {};
  const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (THEME[v(a, 'q136')]) s.theme = THEME[v(a, 'q136')];
  if (TONE[v(a, 'q134')]) s.tone = TONE[v(a, 'q134')];
  if (STYLE[v(a, 'q43')]) s.budget.style = STYLE[v(a, 'q43')];
  // Budget period: the explicit answer wins; otherwise follow the pay cycle; otherwise monthly.
  if (PERIOD[v(a, 'q44')]) { s.budget.period = PERIOD[v(a, 'q44')]; s.budget.periodFrom = 'q44'; }
  else if (PERIOD[v(a, 'q27')]) { s.budget.period = PERIOD[v(a, 'q27')]; s.budget.periodFrom = 'q27'; }
  if (OVERSPEND[v(a, 'q47')]) s.overspend = OVERSPEND[v(a, 'q47')];
  const n = v(a, 'q133');
  if (Array.isArray(n)) s.notifications = n.includes('None') ? [] : n.map((x) => NOTIFY[x]).filter(Boolean);
  return s;
}

// Plain-English labels for the Settings screen.
export const LABELS = {
  theme: { light: 'Light', dark: 'Dark', system: 'Follow my phone' },
  tone: { gentle: 'Gently', straight: 'Straight-talking', blunt: 'Bluntly' },
  style: { strict: 'Strict categories', loose: 'Loose guardrails', free: 'Just my free money' },
  period: { weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly' },
  overspend: { off: 'Off', quiet: 'Quietly', nudge: 'A nudge', loud: 'Loud and clear' },
  notify: { checkin: 'Monthly check-in', behind: 'When I fall behind', bills: 'Bill reminders' },
};

// Status copy for the plan, in the tone Harvey picked (q134). Calm and honest in every tone:
// never "you will", never "guaranteed" (DESIGN.md).
export function behindCopy(tone, status, { depletedLabel = '', retirementAge = '' } = {}) {
  const T = {
    behind: {
      gentle: 'You’re a little short of your target on current plans. Small changes add up — some options are below.',
      straight: 'On current plans you fall short of your target.',
      blunt: 'This plan doesn’t reach your target. Something has to change.',
    },
    short: {
      gentle: `On these numbers your savings would run out around ${depletedLabel}. There are ways to fix that — see below.`,
      straight: `On these numbers your savings run out in ${depletedLabel}, when costs outgrow what you put away.`,
      blunt: `On these numbers you run out of money in ${depletedLabel}. The plan doesn’t work as it stands.`,
    },
  };
  const row = T[status];
  if (!row) return status === 'coasting' ? 'Your pot would reach the target with no more investing.'
    : `On current plans you reach your target by ${retirementAge}.`;
  return row[tone] || row.straight;
}

// Apply the theme to <html> (data-theme), and keep the browser chrome colour in step.
export function applyTheme(theme, doc = globalThis.document) {
  if (!doc) return;
  const root = doc.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme; else delete root.dataset.theme;
  doc.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const forMedia = m.getAttribute('data-media') || m.getAttribute('media') || '';
    if (!m.hasAttribute('data-media')) m.setAttribute('data-media', forMedia);
    const isDark = /dark/.test(forMedia);
    if (theme === 'system') m.setAttribute('media', forMedia);
    else m.setAttribute('media', (theme === 'dark') === isDark ? 'all' : 'not all');
  });
}
