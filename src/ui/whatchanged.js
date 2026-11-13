// "What changed" after editing an answer (T2.2d). PURE.
//   planSnapshot(scenario, projection) -> the handful of numbers people care about
//   diffSnapshots(before, after, { currency }) -> plain-English lines; [] when nothing material moved
import { ym } from '../engine/engine.js';
import { money, monthLabel } from './format.js';

export function planSnapshot(s, p) {
  if (!s || !p) return null;
  const status = p.depletedAt ? 'short' : p.coastDate && p.coastDate === s.start ? 'coasting' : p.onTrack ? 'on-track' : 'behind';
  return { status, coastDate: p.coastDate, depletedAt: p.depletedAt, target: p.target, potAtEnd: p.retirementPot, retirementAge: s.retirementAge };
}

const STATUS = { coasting: 'Coasting', 'on-track': 'On track', behind: 'Behind', short: 'Runs short' };
function span(months) {
  const m = Math.abs(months), y = Math.floor(m / 12), r = m % 12;
  const parts = [];
  if (y) parts.push(`${y} year${y === 1 ? '' : 's'}`);
  if (r) parts.push(`${r} month${r === 1 ? '' : 's'}`);
  return parts.join(' ') || '0 months';
}
// Money moves smaller than this share (or £/A$100) are noise, not news.
const moved = (a, b) => Math.abs(a - b) > Math.max(100, Math.abs(a) * 0.005);

export function diffSnapshots(a, b, { currency = 'GBP' } = {}) {
  if (!a && b) return ['Your plan can now be worked out.'];
  if (a && !b) return ['Your plan can’t be worked out any more — a key answer is missing.'];
  if (!a || !b) return [];
  const m = (x) => money(x, currency, { compact: true });
  const out = [];
  if (a.status !== b.status) out.push(`Status: ${STATUS[a.status]} → ${STATUS[b.status]}.`);
  if (a.coastDate !== b.coastDate) {
    if (a.coastDate && b.coastDate) {
      const d = ym(b.coastDate) - ym(a.coastDate);
      out.push(`Coast date moved from ${monthLabel(a.coastDate)} to ${monthLabel(b.coastDate)} (${span(d)} ${d > 0 ? 'later' : 'sooner'}).`);
    } else if (b.coastDate) out.push(`You now reach coast in ${monthLabel(b.coastDate)}.`);
    else out.push(`You no longer reach coast before you stop work (was ${monthLabel(a.coastDate)}).`);
  }
  if (a.depletedAt !== b.depletedAt) {
    if (!b.depletedAt) out.push('Your savings no longer run out.');
    else if (!a.depletedAt) out.push(`Your savings now run out in ${monthLabel(b.depletedAt)}.`);
    else out.push(`Savings run out ${monthLabel(b.depletedAt)} instead of ${monthLabel(a.depletedAt)}.`);
  }
  if (a.retirementAge !== b.retirementAge) out.push(`Stop-work age: ${a.retirementAge} → ${b.retirementAge}.`);
  if (moved(a.target, b.target)) out.push(`Target pot: ${m(a.target)} → ${m(b.target)}.`);
  if (moved(a.potAtEnd, b.potAtEnd)) {
    const f = (x) => (x < 0 ? `short by ${m(-x)}` : m(x));
    out.push(`Pot at ${b.retirementAge} (middle case): ${f(a.potAtEnd)} → ${f(b.potAtEnd)}.`);
  }
  return out;
}
