# DECISIONS — log every judgement call (decision · why · how to reverse)

**D1 — App name stays "Forge".** Harvey asked for it. Legacy app is kept as a reference repo only.

**D2 — New codebase, not an in-place edit of legacy Forge.** Harvey didn't answer "standalone vs inside Forge".
Chosen: standalone, because legacy Forge has permissive RLS + client PIN auth (fine for friends, unsafe for real
finances) and is one 640 KB file that is hard to unit-test. *Reverse:* port `src/engine` into legacy Forge as a Money tab
once its Phase 5 auth migration is done; the engine is dependency-free so it moves cleanly.

**D3 — No build step; plain ES modules.** Keeps Harvey's love of copy-paste deployability, but splits the code so
the engine is testable. *Reverse:* add a bundler later if the module count hurts load time.

**D4 — All maths in today's money (real terms), monthly compounding.** Avoids the Instagram post's hidden
inflation trap (their $4.3M ≈ 7.1% nominal). Nominal view is a display toggle (T1.5).

**D5 — Local-first, demo mode first.** UI works with LocalStore so Harvey can use it before Supabase exists and so
unattended runs never block on credentials.

**D6 — Separate Supabase project with Supabase Auth + owner-only RLS.** See docs/SECURITY.md.

**D7 — Tests use Node's built-in runner (`node --test`)** — zero dependencies for the engine; Playwright only for UI.

**D8 — Personal data kept out of git** (`data/seed.local.json`, gitignored; `seed.example.json` is sanitised).

**D9 — Onboarding runs on first launch, local-first.** Harvey asked for the questions to be answered in the app on
boot-up. Answers save to localStorage after every answer (`forge.onboarding.v1`, try/caught, in-memory fallback)
so it works before Supabase exists; sync is T2.2f. *Reverse:* none needed — the store is swappable.

**D10 — Question numbering matches the "Forge intake" doc (1–146).** So answers written there by number can be
entered or imported. New questions get numbers above 146.

**D11 — Quick start = 32 ★ questions** covering everything `answersToScenario` needs, so a usable plan exists after
~10 minutes. The full 146 can be finished later from Review.

**D12 — A negative projected pot is shown as a shortfall** ("Runs short", "short by £X") with the month money runs
out (`depletedAt`), never as a negative balance. The engine still compounds negatives (it models borrowing at the
investment return, which flatters nothing but is unrealistic) — T2.2b/T1.x may switch to a debt rate.

**D13 — Training length defaults to 18 months** (the Speedbird course length Harvey confirmed), logged as an
assumption on the plan. Currency conversion inside onboarding uses the legacy offline rate table until T1.1.

**D14 — The planner lives in `planner/` inside the `HarveyBetts/Forge` repo for now.** The session that picked up the
handover could only reach that repo and could not create `forge-planner` (H1). Building in a subfolder on a feature
branch keeps the legacy app at the repo root untouched (its Pages site is unaffected) and nothing is lost. Note:
GitHub only runs workflows from the repo-root `.github/`, so `planner/.github/workflows/*` are dormant until the split.
*Reverse:* H1 below — split `planner/` into its own repo with full history (`git subtree split`).

**D15 — FX differs from legacy on purpose in three places:** unknown currencies throw (legacy silently used 1:1, which
hides bugs); fetched rates are validated before use; the cache key is versioned (`forge.fx.v1`). Same source
(open.er-api.com, free, keyless, mid-market), same 6 h TTL, same USD-based maths, same offline table (+EUR from legacy).
CSP `connect-src` now allows `https://open.er-api.com`. *Reverse:* swap `FX_URL`; the module is injectable.

**D16 — T2.2a pulled forward to straight after T1.1.** The FX change touched `src/app.js`, and the old walk script couldn't
launch a browser in this environment, so the plan screen had no end-to-end cover. Moving the walk into the Playwright suite
first means every later app change is checked by a real browser walk.
