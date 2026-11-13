# PROGRESS — append one entry per completed task (newest last)

Format: `## YYYY-MM-DD T<id> — summary` then **Changed**, **Verified** (test names / screenshot paths), **Needs Harvey's eyes**.

## 2026-11-12 — Handover created
**Changed:** repo scaffold, `src/engine/engine.js` (coast number, projections, fan, solver), 16 unit tests, CI + Pages workflows, schema, edge-function sketch, docs.
**Verified:** `node --test tests/*.test.js` → 16/16 pass.
**Needs Harvey's eyes:** nothing yet.

## 2026-11-13 T2.2 — Onboarding on first launch
**Changed:** `src/onboarding/{questions,answers,state,inputs}.js`, `src/app.js`, `src/ui/format.js`, `src/fx/fallback.js`,
new `index.html` (Slate styles, dark mode, CSP), engine `depletedAt`, `onboarding_answers` table in schema, `docs/ONBOARDING.md`,
generated `docs/QUESTIONS.md`, `tests/onboarding.test.js`, `tests/e2e/onboarding.walk.mjs`.
**Verified:** `npm run check` → 39/39 unit tests. Playwright walk at iPhone 15 size: Quick start (32 questions, sample
answers) → Plan screen; reload resumes on the Plan; no console errors (fonts blocked in the sandbox only); no horizontal
overflow on any screen. Screenshots reviewed: welcome, choice, money, fields, plan, review.
**Needs Harvey's eyes:** everything visual on his iPhone — logic-validated, not device-verified. Especially: month
picker feel on iOS, auto-advance timing on choice questions, the plan screen's wording.

## 2026-11-13 T0.1 — First commit
**Changed:** handover pack committed into `planner/` of the `Forge` repo (D14); H1 rewritten for the subfolder → own-repo split.
**Verified:** `npm run check` → syntax OK, 39/39 unit tests pass; `git check-ignore` confirms `data/seed.local.json` is ignored.
**Needs Harvey's eyes:** nothing.

## 2026-11-13 T0.2 — Playwright at iPhone size
**Changed:** `@playwright/test` devDependency, `playwright.config.js` (iPhone 15 viewport on Chromium, serves the app via
`scripts/serve.mjs` on port 8181, uses the sandbox's pre-installed Chromium when present), `tests/e2e/helpers.js`,
`tests/e2e/smoke.spec.js`, `npm run test:e2e`, CI job `e2e` (installs Chromium, uploads `artifacts/`).
Kept out of `npm run check` on purpose: `check` stays dependency-free and sub-second; CI runs e2e as its own job.
**Verified:** `npm run test:e2e` → 1 passed; `artifacts/smoke-welcome.png` reviewed (welcome screen, no overflow, no console errors).
**Needs Harvey's eyes:** nothing.

## 2026-11-13 T0.3 — Storage interface + LocalStore
**Changed:** `src/data/store.js` — async storage interface (scenarios, monthly snapshots, settings, full backup
export/import, clearAll) and `createLocalStore` (localStorage, every access try/caught, in-memory cache + fallback,
`persistent` flag for the UI warning). Backups include the onboarding answers so export → clear → import restores everything.
`parseBackup` validates before writing (never half-imports). `memoryStorage()` test double.
**Verified:** `tests/store.test.js` (13 tests): empty storage, quota error, storage that throws on every access (iOS private
mode), null storage, corrupt JSON in each key, copy-on-read, persistence across instances, snapshot upsert/sort, export→clear→import,
bad backups rejected with readable errors and nothing written. `npm run check` → 52/52.
**Needs Harvey's eyes:** nothing (no UI yet).

## 2026-11-13 T0.4 — Seed loader (dev only)
**Changed:** `scripts/seed-lib.mjs` (pure `seedToAnswers`), `scripts/seed.mjs` + `npm run seed` → writes
`data/seed.import.local.json` (gitignored), an answers backup the app imports via "Restore answers from a backup".
Only **confirmed** facts are imported; unconfirmed pots and the placeholder assumptions are listed as skipped (names only,
never values) so onboarding asks for them. `build-site.sh` takes an optional output dir and refuses to stage any `data/`,
`seed*.json` or `*.local.json`.
**Verified:** `tests/seed.test.js` (5): confirmed-only mapping, invalid birth/age ignored, output accepted by the app's
`importAnswers`, and a real `build-site.sh` run into a temp dir contains no data/docs/tests/scripts/local JSON.
`npm run seed` against the real seed: 2 answers (base currency, course start Sep 2027); ISA, super, birth, retirement age skipped.
**Needs Harvey's eyes:** your seed file marks the ISA and super balances `confirmed:false` — confirm them in onboarding (q49).

## 2026-11-13 T1.1 — Live FX engine
**Changed:** `src/fx/fx.js` — `createFx({fetch, now, storage})` with `ensure/rates/convert/isLive/ageMs/source`, `pickRates`
validation, `fxBadge` ("rates updated 3h ago" / "approx. offline rates"); `FX_FALLBACK` gains EUR (from legacy). App now
converts with live rates (fallback until fetched), refreshes the plan **in place without replaying the ring** if rates change
after boot, and the assumptions list says which rates were used. CSP allows open.er-api.com; e2e serves a fixed rate table.
**Verified:** `tests/fx.test.js` (11): round-trips equal to 1e-9 for 4 pairs × 4 amounts, legacy maths, unknown currency throws,
payload validation, fallback before any fetch / offline first launch (not persisted), 6 h cache + refresh + force, cache survives
reload, stale-but-real kept when offline, HTTP error/bad JSON/corrupt cache/hostile storage, concurrent calls share one request.
Found and fixed a bug while testing: a cache timestamp of 0 read as "never fetched". Plan screen screenshot `artifacts/onb-5-plan.png`.
**Needs Harvey's eyes:** nothing new visually (one extra line in Assumptions).

## 2026-11-13 T2.2a — Onboarding walk in the Playwright suite
**Changed:** `tests/e2e/onboarding.spec.js` replaces the standalone `onboarding.walk.mjs` (which couldn't find a browser here):
same sample answers, waits on real state changes instead of fixed sleeps, asserts no overflow on every question, Plan after
finishing, resume-to-Plan after reload, Review screen, zero console errors. `walkQuickStart()` is exported for reuse.
CI `e2e` job (T0.2) runs it and uploads `artifacts/` (dormant until the repo split — D14).
**Verified:** `npm run test:e2e` → 2 passed; screenshots `artifacts/onb-1…6`.
**Needs Harvey's eyes:** nothing new.
