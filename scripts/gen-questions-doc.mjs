// Regenerates docs/QUESTIONS.md from src/onboarding/questions.js. Run: npm run docs:questions
import { writeFileSync } from 'node:fs';
import { QUESTIONS, SECTIONS, optLabel } from '../src/onboarding/questions.js';

const PER = { mo: '/month', yr: '/year', wk: '/week', once: 'one-off' };
const typeLabel = (q) => {
  if (q.type === 'money') return `money ${PER[q.per] || ''}`.trim();
  if (q.type === 'choice' || q.type === 'multi') return `${q.type === 'multi' ? 'pick any' : 'pick one'}: ${q.opts.map(optLabel).join(' / ')}`;
  if (q.type === 'fields') return 'boxes: ' + q.fields.map((f) => `${f.label} (${f.type === 'money' ? 'money' : f.type})`).join(', ');
  if (q.type === 'scale') return `scale 1–5: ${q.labels[0]} → ${q.labels[1]}`;
  return q.type + (q.unit ? ` (${q.unit})` : '');
};
let md = `# QUESTIONS — the onboarding question bank\n\n> Generated from \`src/onboarding/questions.js\` by \`npm run docs:questions\`. Do not edit by hand.\n\n`;
md += `${QUESTIONS.length} questions · ★ = Quick start (${QUESTIONS.filter((q) => q.star).length}) · ⤷ = only shown when an earlier answer makes it relevant · → = feeds the plan\n\n`;
for (const s of SECTIONS) {
  md += `## ${s.id}. ${s.title}\n\n| # | Question | Answer type | |\n|---|---|---|---|\n`;
  for (const q of QUESTIONS.filter((x) => x.section === s.id)) {
    const flags = [q.star ? '★' : '', q.when ? '⤷' : '', q.map ? `→ ${q.map}` : ''].filter(Boolean).join(' ');
    md += `| ${q.n} | ${q.text.replace(/\|/g, '\\|')} | ${typeLabel(q).replace(/\|/g, '\\|')} | ${flags} |\n`;
  }
  md += '\n';
}
writeFileSync(new URL('../docs/QUESTIONS.md', import.meta.url), md);
console.log('wrote docs/QUESTIONS.md');
