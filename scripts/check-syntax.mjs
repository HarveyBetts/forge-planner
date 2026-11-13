// Syntax-checks every .js/.mjs file (node --check) and every inline <script type="module"> in index.html.
import { readdirSync, statSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const roots = ['src', 'scripts', 'tests', 'supabase'];
const skip = new Set(['node_modules', '.git', 'logs', 'artifacts']);
const files = [];
function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (skip.has(e)) continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (['.js', '.mjs'].includes(extname(p))) files.push(p);
  }
}
roots.forEach(walk);

let failed = 0;
function check(path, label = path) {
  const r = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (r.status !== 0) { failed++; console.error('SYNTAX ERROR in ' + label + '\n' + r.stderr); }
}
files.forEach((f) => check(f));

// Inline module scripts in index.html
try {
  const html = readFileSync('index.html', 'utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m; let n = 0;
  const dir = mkdtempSync(join(tmpdir(), 'forge-inline-'));
  while ((m = re.exec(html))) {
    const f = join(dir, 'inline' + (n++) + '.mjs');
    writeFileSync(f, m[1]);
    check(f, 'index.html inline script #' + n);
  }
} catch { /* no index.html yet */ }

if (failed) { console.error(failed + ' file(s) failed syntax check'); process.exit(1); }
console.log('syntax OK (' + files.length + ' files)');
