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
