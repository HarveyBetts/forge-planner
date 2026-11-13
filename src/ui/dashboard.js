// Plan dashboard model (T2.3). PURE: decides what the Plan screen says; app.js only renders it.
//   status chip  = where today's pot sits against the glide path (ahead / on track / behind), or "runs short"
//   ring         = pot ÷ coast number, capped at 100% visually; beyond it → "Coasting · +£X surplus"
//   free money   = this month's money you don't need to invest (un-invested share + planned investing once coasting)
import { glidePath, trackStatus } from '../engine/glide.js';
import { behindCopy } from './settings.js';
import { monthLabel } from './format.js';

export const CHIP = {
  ahead: { kind: 'ok', label: 'Ahead', icon: 'up' },
  'on-track': { kind: 'info', label: 'On track', icon: 'check' },
  behind: { kind: 'warn', label: 'Behind', icon: 'alert' },
  short: { kind: 'warn', label: 'Runs short', icon: 'alert' },
};

// s: scenario, res: projectScenario(s), cs: scenarioCoastStatus(s)
export function dashboardModel(s, res, cs, { tone = 'straight', tolerance } = {}) {
  const glide = glidePath(s);
  const track = trackStatus(cs.pot, glide.needToday, tolerance != null ? { tolerance } : {});
  const status = res.depletedAt ? 'short' : track.status;
  let message;
  if (status === 'short') message = behindCopy(tone, 'short', { depletedLabel: monthLabel(res.depletedAt) });
  else if (cs.isCoasting) message = 'Your pot would reach the target with no more investing.';
  else if (status === 'ahead') message = 'You’re ahead of where your plan needs you to be today.';
  else if (status === 'on-track') message = `You’re where your plan needs you to be to reach your target by ${s.retirementAge}.`;
  else message = behindCopy(tone, 'behind');

  const ratio = cs.coastNumber > 0 ? cs.pot / cs.coastNumber : 1;
  const ring = cs.isCoasting
    ? { ratio: 1, pct: Math.round(Math.min(ratio, 9.99) * 100), label: 'Coasting', coasting: true, surplus: cs.surplus }
    : { ratio: Math.max(0, Math.min(1, ratio)), pct: Math.max(0, Math.round(ratio * 100)), label: 'of your coast number', coasting: false, surplus: 0 };

  const first = res.rows[0] || { freed: 0, contribution: 0 };
  const freeNow = Math.max(0, first.freed) + (cs.isCoasting && !s.redirectAfterCoast ? Math.max(0, first.contribution) : 0);
  const free = freeNow > 0
    ? { amount: freeNow, note: cs.isCoasting ? 'you could spend instead of investing — your pot reaches the target without it' : 'not invested under your plan' }
    : { amount: 0, note: res.coastDate ? `From ${monthLabel(res.coastDate)} your investing becomes optional.` : 'Your investing is still needed every month on these numbers.' };

  return { status, chip: CHIP[status], message, ring, free, glide, track };
}
