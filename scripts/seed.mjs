// `npm run seed` — dev only. Reads data/seed.local.json (gitignored) and writes
// data/seed.import.local.json (also gitignored), an answers backup to load in the app via
// "Restore answers from a backup". Prints names of what was used/skipped, never the numbers.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { seedToAnswers } from './seed-lib.mjs';

const IN = 'data/seed.local.json';
const OUT = 'data/seed.import.local.json';
if (!existsSync(IN)) {
  console.log(`No ${IN} — nothing to do. (Copy data/seed.example.json to ${IN} and fill it in.)`);
  process.exit(0);
}
let seed;
try { seed = JSON.parse(readFileSync(IN, 'utf8')); } catch (e) { console.error(`${IN} isn't valid JSON: ${e.message}`); process.exit(1); }
const { backup, used, skipped } = seedToAnswers(seed);
writeFileSync(OUT, JSON.stringify(backup, null, 2));
console.log(`Wrote ${OUT} (${Object.keys(backup.answers).length} answers).`);
console.log('Used:    ' + (used.join(', ') || 'nothing'));
console.log('Skipped: ' + (skipped.join(', ') || 'nothing'));
console.log('Open the app → "Restore answers from a backup" → pick that file. Onboarding will ask for the rest.');
