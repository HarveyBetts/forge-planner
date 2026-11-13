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
