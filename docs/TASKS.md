# TASKS — the work queue

Legend: `- [ ]` open · `- [x]` done · `- [~]` blocked on Harvey (reason after the em dash; steps in HUMAN_TODO.md).
Work top to bottom. A task is done only when its **Accept** line is proven by a test or screenshot.
Phases 0–3 need nothing from Harvey except a GitHub repo to push to. Everything must work in **demo mode**
(LocalStore, no backend) so he can use the app before Supabase exists.

## Phase 0 — Foundation
- [x] **T0.1** Run `npm run check`; confirm green. Init git if needed (`git init -b main`), first commit. Accept: clean commit, check passes.
- [x] **T0.2** Add Playwright (devDependency) with an iPhone-sized viewport project, a smoke test (index loads, no console errors), and `npm run test:e2e`; wire into `npm run check` only if it runs headless in CI. Accept: screenshot saved to `artifacts/`.
- [x] **T0.3** Storage interface `src/data/store.js` (`listScenarios/getScenario/saveScenario/deleteScenario/listSnapshots/saveSnapshot/getSettings/saveSettings/exportAll/importAll`) + `LocalStore` (localStorage, try/catch, in-memory fallback). Unit tests with a fake storage. Accept: tests cover empty storage, quota error, corrupt JSON.
- [x] **T0.4** Seed loader (dev only): if `data/seed.local.json` exists, `npm run seed` writes an export file the app can import. Never bundled into `_site/`. Accept: `build:site` output contains no `data/`.

## Phase 1 — Engine completion (pure, tested)
- [x] **T1.1** `src/fx/fx.js`: port the logic of legacy `fxEnsure/fxConvert/FX_FALLBACK` (GBP, AUD, USD, EUR). Injectable fetch + clock for tests. Accept: round-trip conversion exact; offline fallback used; 6 h cache.
- [x] **T1.2** Multi-pot model: pots with `currency`, `kind` (`invested|cash|pension|super`), `accessAge`, contribution rules; convert to base currency via FX; engine reports invested vs locked-until-age. Do NOT hardcode UK/AU pension access ages from memory — research, cite the source in DECISIONS.md, make editable. Accept: tests incl. a locked pot that cannot fund pre-access-age drawdown.
- [x] **T1.3** Life-event library `src/engine/events.js`: pure `applyEvent(scenario, event)` for templates — `speedbirdPathway` (course start, 18-month training, reduced scale N years, then main scale; **salary figures come from user input, never invented**), `child` (running cost curve; optional school fees from age X to Y), `houseDeposit`, `holiday` (recurring N/yr), `car`, `oneOffTrip`, `relocation` (currency + cost-of-living switch). Accept: each template has tests asserting exact cash-flow months.
- [x] **T1.4** Required-contribution + "what must be true" helpers (build on `solveMonthlyContribution`): required return, required retirement age, required spend cut. Accept: bisection tests; unreachable → `null` handled in UI contract.
- [x] **T1.5** Real-vs-nominal toggle helpers + inflation display conversion. Accept: tests.
- [ ] **T1.6** Glide path: ideal pot-by-date line from today to target; `trackStatus(actual, glide)` → `ahead|on-track|behind` with tolerance. Accept: tests incl. boundary cases.
- [ ] **T1.7** Scenario JSON schema validation (`docs/SPEC.md`), versioned, with migration stub. Accept: invalid inputs produce readable errors.

## Phase 2 — UI (mobile-first, Slate design, demo mode)
- [ ] **T2.1** App shell: router (hash routes; only plain `#name`), bottom nav (Plan · Timeline · Budget · Scenarios · Settings), safe-area handling, dark mode, reduced-motion. Accept: screenshot at iPhone viewport.
- [x] **T2.2** Onboarding on first launch — 146 questions (32 ★ quick start), save + resume, review/edit, export/import, answers → starter plan. Built in the handover; see docs/ONBOARDING.md.
- [x] **T2.2a** Move `tests/e2e/onboarding.walk.mjs` into the T0.2 Playwright suite and run it in CI. Accept: CI green with the walk + screenshots uploaded as an artifact.
- [ ] **T2.2b** Map the remaining answers into the scenario (training cost/loan q14–q16, parental leave q76, mortgage + buying costs q99–q100, university q87, school-fee inflation q92, car running q111, captain q21, UK return q3). Accept: a test per mapping asserting exact months/amounts; anything unmappable stays in `notPlaced`.
- [ ] **T2.2c** Answers drive settings: theme q136, "behind" tone q134, budget style/period q43/q44/q27, notifications q133, overspend flags q47. Accept: tests + screenshots.
- [ ] **T2.2d** "What changed" summary after editing an answer (e.g. "Coast date moved from Mar 2031 to Feb 2034"). Accept: unit test on the diff + screenshot.
- [ ] **T2.2e** Paste-in import of numbered answers typed in the Forge intake doc → parsed preview → confirm. Accept: parser tests incl. messy input; nothing saved without confirmation.
- [ ] **T2.3** Dashboard (a first version exists: the Plan screen in `src/app.js` → polish it into the full design): animated progress ring (pot vs coast number), status chip (ahead/on-track/behind), "free money this month" card, assumptions disclosure, real-terms label. Accept: screenshots for all three states.
- [ ] **T2.4** Projection chart (SVG, no libs): low/mid/high fan, glide path, actuals overlay, coast date marker. Accept: renders for edge cases (never coasts, already coasting).
- [ ] **T2.5** Life timeline: horizontal scrub through years with animated life-stage markers (training, FO start, kids, house…). Accept: scrubbing updates pot/age readout; works with keyboard.
- [ ] **T2.6** Event editor sheet (Apple-style bottom sheet, drag-to-dismiss, ≥16px inputs) for the T1.3 templates. Accept: add/edit/delete event updates projection live.
- [ ] **T2.7** Scenario compare (A vs B side by side + delta). Accept: e2e "1 child vs 2 children".
- [ ] **T2.8** Settings: currency (base/secondary), assumptions, export/import JSON backup, "delete all my data". Accept: export → clear → import restores everything.
- [ ] **T2.9** Empty/zero-data, error and loading states everywhere ("stranger test"). Accept: app usable from a completely empty browser.

## Phase 3 — Tracking & budgeting
- [ ] **T3.1** Monthly check-in: enter actual pot values → snapshot → compare to glide path. Accept: on-track/behind updates.
- [ ] **T3.2** Budget v1: categories + transactions, monthly period, planned vs actual, "freed-up money" linked to the engine's `freed` value. Accept: tests for period maths.
- [ ] **T3.3** CSV import (column mapping, dedupe, preview before commit). Accept: sample CSV fixtures for 2 bank formats; malformed rows reported, not crashed.
- [ ] **T3.4** Reality check card: compares actual monthly saving rate with what the plan assumes. Accept: tests.

## Phase 4 — Backend (needs Harvey for H1–H3; build against mocks first)
- [ ] **T2.2f** (Phase 4) Sync onboarding answers to Supabase `onboarding_answers`; add the Supabase origin to the CSP `connect-src`. Accept: mocked sync tests.
- [ ] **T4.1** `SupabaseStore` implementing the T0.3 interface; config via a gitignored `config.local.js` / documented public config. Mock client for tests. Accept: contract tests run against both stores.
- [ ] **T4.2** Auth UI (magic link or email+password), session handling, sign-out, delete-account flow. Accept: mocked-auth e2e.
- [ ] **T4.3** Sync policy: local-first; push on change; per-scenario last-write-wins on `updated_at`; conflict toast. Accept: tests for offline edits then reconnect.
- [ ] **T4.4** RLS verification script (`supabase/tests/rls.sql` + doc): two users cannot see/modify each other's rows; anon sees nothing. Accept: documented queries + expected results; mark `[~]` until Harvey runs it against the real project.

## Phase 5 — AI planner
- [ ] **T5.1** Finish + test `supabase/functions/planner-ai` (mock Deno/fetch): auth required, daily cap enforced, input/output size caps, no key leakage in errors. Deploy is Harvey's step (H5).
- [ ] **T5.2** Client `askPlanner(question, scenario)` + chat UI; show the AI's proposed change as a diff the user must accept (never auto-apply). Accept: tests with a mocked function.
- [ ] **T5.3** Prompt suite: 10 representative questions (e.g. "what if I return to the UK in 2028?") with expected qualities; a markdown eval doc. Accept: eval doc committed.

## Phase 6 — PWA & polish
- [ ] **T6.1** `manifest.webmanifest`, icons (reuse legacy Forge icons from its public repo), service worker (cache-first shell, network-first data), iOS standalone meta. Accept: Lighthouse-style checks documented.
- [ ] **T6.2** Accessibility + performance pass (focus order, contrast, aria on chart/ring, no layout shift, no infinite filters). Accept: checklist in PROGRESS.md.
- [ ] **T6.3** Consistency pass: one motion/spacing/empty-state/wording language. Accept: screenshot set.
- [ ] **T6.4** Privacy policy + "not financial advice" pages; data-export and deletion documented in-app.

## Phase 7 — Deploy & ops
- [ ] **T7.1** Confirm CI + Pages workflows work (first green deploy). Likely `[~]` until Harvey enables Pages (H2).
- [ ] **T7.2** README for Harvey (non-technical): how to open the app, back up data, what to do if something breaks.
