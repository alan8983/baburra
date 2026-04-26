## Context

The KOL detail page (`/kols/[id]`) is the primary read surface for the product — it's where a user judges whether a KOL is worth following. Three independently shippable subsystems feed it:

1. **Posts query** — `useKolPosts(id)` → `GET /api/kols/[id]/posts` → `listPosts({kolId, limit})` returning the most recent N posts. The page derives per-stock breakdowns, chart sentiment markers, and post lists from this set in-memory.
2. **Win-rate scorecard** — `useKolWinRate(id)` → `GET /api/kols/[id]/win-rate` → `kol_scorecard_cache` row with TTL + stale-flag invalidation. On a miss the route returns `{status:'computing'}` and fires `enqueueKolScorecardCompute` (fire-and-forget).
3. **Scorecard compute** — `computeKolScorecard(kolId)` runs `listPosts({kolId, limit:1000})`, fetches per-stock candles via `getStockPrices(ticker)` with a 5 s `withTimeout` race per stock, then aggregates win-rate samples into the cache.

Each subsystem works in isolation. The user-facing page renders correctly when:
- the posts query returns enough posts to cover every stock the KOL has written about,
- the cache is fresh,
- the cache was computed with non-empty candles for every relevant stock.

The 2026-04-26 Gooaye browser validation hit a state where **all three** of these conditions silently failed at the same time, producing a page that looks like the scrape never happened even though Postgres has 138 posts, 93 of them ≤7 days old. There is currently no automated check that catches "DB is consistent but the page is broken" — every test asserts code paths in isolation.

The user's explicit ask: "Not only fixing current issue, please make this a Quality Assurance gate to prevent these mismatches in the future."

## Goals / Non-Goals

**Goals:**
- The KOL detail page reflects 100 % of a KOL's posts, not the latest 20.
- After any successful scrape, the next page-load shows fresh win-rate numbers without relying on a fire-and-forget background recompute.
- A single CLI command (`npx tsx scripts/check-kol-consistency.ts <kolId>`) returns exit 0 iff the page would render correctly for that KOL, and exit ≠0 with a printed diff otherwise.
- The CLI is wired into every scrape script and into the `validate-podcast-pipeline-with-gooaye` validation hook so a regression cannot ship undetected.
- A Playwright e2e proves the page-level invariants end-to-end at least for the seeded test KOL.

**Non-Goals:**
- Backfilling `post_stocks.sentiment` (separate change `backfill-per-stock-sentiment`).
- Reworking the read-through fire-and-forget compute pattern itself — it stays as the on-demand path; we just stop relying on it for post-scrape freshness.
- Architecting around Tiingo rate limits beyond a single timeout knob (broader piece of work).
- Real-time cache invalidation propagation to logged-in browsers (a refresh fixes it; that's good enough today).

## Decisions

### D1 — Page-load posts: pull the full set, not a paginated slice

**Decision**: `KolDetailPage` calls `useKolPosts(id, { limit: 1000 })`. The hook keeps its existing `params?: { page?, limit? }` shape; the page is the only caller that needs the full set.

**Why over alternatives**:
- *Server-side aggregation endpoint* (e.g. `GET /api/kols/[id]/stocks-aggregate`) is the architecturally cleaner answer, but it duplicates logic that already exists in the page's `useMemo` blocks and forces a second round-trip on every page-load. Defer until we have evidence that 1000-post payloads are slow.
- *Bumping the default to 1000* in `listPosts` is risky — it would also affect `/posts`, `/stocks/[ticker]`, etc., which are user-paginated and SHOULD cap at 20.
- *Cursor pagination on the page* would force the per-stock breakdown to incrementally fill in, which is worse UX than waiting once for the full set.

**Bound**: 1000 matches what `computeKolScorecard` already uses, so cache and page agree on "the universe of posts for this KOL". A KOL with >1000 posts is hypothetical today (max in DB is 138); when one shows up, both numbers move together.

### D2 — Synchronous scorecard recompute at scrape completion

**Decision**: After `completeScrapeJob(jobId, …)` in `profile-scrape.service.ts:604`, await `computeKolScorecard(kolId)` before returning. Wrapped in `try/catch`+`console.warn` so a recompute failure does not flip the scrape status back from `completed`.

**Why over alternatives**:
- *Background compute via the read-through* is what we have today; it's the bug. Fire-and-forget swallows errors and on Vercel needs `waitUntil` to outlive the response, which scrape scripts running locally don't have.
- *Cron / scheduled job* would catch it eventually but leaves a window where the page is broken; we want the cache fresh by the time the user opens the page after running their own scrape.
- *Blocking the API response on cache compute* would leak Tiingo latency into every read; the synchronous compute happens at the *write* boundary (scrape completion), not the *read* boundary.

**Cost**: scrape-script wall time grows by however long `computeKolScorecard` takes. On Gooaye-scale (138 posts, 30+ stocks) this is ~10 s with a fast Tiingo and up to ~5 min with a slow one (per the backfill log). Acceptable for a script that already takes minutes to scrape.

### D3 — Drop the per-stock 5 s race in `computeKolScorecard`

**Decision**: Set `COMPUTE_TIMEOUT_MS = 30_000` (six-fold bump). Keep the race so a single dead Tiingo call doesn't hang the whole compute, but make the bound generous enough that the price repo's own stale-cache fallback (`stock-price.repository.ts:329`) finishes before we give up.

**Why not 0 (drop the race)**: a true Tiingo hang (TCP keep-alive but no response) would block the compute forever. 30 s leaves headroom for the fallback path while still bounding the worst case.

**Why not 5 s (the current value)**: the backfill log shows every stock printed `Price API failed for X, serving stale cache` — meaning Tiingo timed out, the repo started its fallback, but the outer 5 s race rejected before the fallback returned. Result: `candlesByStock[stockId] = []` for every slow stock and 100 % `excluded` samples for those stocks. Empirically the fallback comes back within ~10–20 s.

**Open**: D3 is a knob, not a fix. The proper fix is to make `getStockPrices` return inside its own SLA. Tracked as out-of-scope future work.

### D4 — `scripts/check-kol-consistency.ts` is the QA gate

**Decision**: One script, four invariants, exit codes drive callers.

```
npx tsx scripts/check-kol-consistency.ts <kolId>          # human-readable diff
npx tsx scripts/check-kol-consistency.ts <kolId> --json   # machine-readable
```

**Invariants**:

| ID | Assertion | Catches |
|----|-----------|---------|
| I-1 | `kols.post_count === COUNT(posts WHERE kol_id=…)` | denorm drift (orthogonal but worth surfacing while we're here) |
| I-2 | `kol_scorecard_cache.post_count === COUNT(posts WHERE kol_id=…)` AND `stale=false` AND `now() - computed_at < 12 h` | Issue 2 directly — stale cache, missed recompute, classifier-version drift |
| I-3 | For every stock with ≥3 Gooaye posts, `bucketsByStock[stockId].day30.total ≥ 1` | the "compute landed but Tiingo dropped most stocks" failure mode (the NVDA total:0 we just hit) |
| I-4 | `listPosts({kolId, limit: 1000}).total === kols.post_count` | Issue 1 if it ever regresses (pagination cap returns) |

**Why one script not four**: a CI failure with one error number is more actionable than four flaky probes. Output collapses to a single diff table.

**Threshold for I-3**: 3 posts is the minimum where "all excluded" stops being plausible noise. Tunable; document the choice in the script.

### D5 — Wire the gate into three places

| Site | Why |
|------|-----|
| Tail of every Gooaye-scope scrape script | Catches the failure at write time before the user opens the page. Script exit ≠0 surfaces the regression in the same terminal that ran the scrape. |
| `validate-podcast-pipeline-with-gooaye/tasks.md` validation hook | Makes the gate part of the OpenSpec validation contract, so future changes touching the pipeline can't archive without it green. |
| Vitest spec at `src/scripts/__tests__/check-kol-consistency.test.ts` | Deterministic CI check against at least the seeded test KOL. Doesn't replace the runtime check but covers the structural invariants. |

### D6 — Playwright e2e for end-to-end coverage

**Decision**: New `e2e/kol-detail.spec.ts` (or extend the existing detail spec if one exists). Asserts:
- Per-stock NVDA card text-content count matches a SQL probe count for `(kolId, NVDA)`.
- The win-rate ring's accessible name is not "—" within 30 s of page load (allows for the polling state to settle).

**Why**: invariants I-1…I-4 catch DB/cache drift but a CSS regression that hides the breakdown card would still pass them. Playwright is the only layer that catches "page renders correctly".

## Risks / Trade-offs

- [Risk] Synchronous recompute lengthens scrape-script wall time → Mitigation: log the duration; if it grows past 60 s consistently, revisit by parallelizing per-stock fetches inside `computeKolScorecard` or by partial-recompute (only stocks touched by the scrape).
- [Risk] Bumping `COMPUTE_TIMEOUT_MS` to 30 s means a single hung Tiingo call holds the compute open longer → Mitigation: per-stock, not global; `Promise.allSettled` ensures one slow stock doesn't block the others.
- [Risk] `listPosts({kolId, limit: 1000})` payload size for a KOL with 1000 posts (~3-5 MB JSON) on a slow connection → Mitigation: not relevant for any KOL today; revisit if/when one approaches the cap. Add a `console.warn` in the API route when `total > 500` to give us a heads-up.
- [Risk] The QA gate is only as useful as the places it runs → Mitigation: D5 wires it into three places; document in `qa-standards` that any new bulk-import or backfill script MUST tail-call it.
- [Risk] False-positive on I-3 for a brand-new stock with 3 posts and no candles yet → Mitigation: I-3 short-circuits when `volatility_thresholds` shows no rows for the (ticker, period) — that's a real "no signal yet" state, not a bug.

## Migration Plan

No migration. Order of operations:

1. Land the proposal + spec deltas + tasks (this change).
2. Implement D1–D4 (code + script).
3. Run `scripts/check-kol-consistency.ts b7a958c4-f9f4-48e1-8dbf-a8966bf1484e` against current Gooaye state. Expect I-3 to fail (NVDA d30 total = 0). Expect I-1, I-2, I-4 to pass after the manual backfill we already ran.
4. Implement D3 (timeout bump). Re-run `scripts/backfill-gooaye-scorecard.ts`. Re-run the consistency check; expect I-3 to pass.
5. Implement D5 wiring. Re-run a small scrape script end-to-end; the tail check should run and pass.
6. Implement D6 Playwright spec. Run `npm run test:e2e`; should pass.
7. Open PR. Tests gate the merge.

Rollback: each commit is independently revertable. The QA gate is additive and can't break anything if the script itself is buggy (a script bug surfaces as a noisy CI failure, not a data corruption).

## Open Questions

- **Q1 — Where should the consistency check run for non-Gooaye KOLs?** Today the seed is Gooaye-only. When the product launches with multiple KOLs, do we run the check per-KOL on every cron, or sample? Defer until we have multiple non-test KOLs in prod.
- **Q2 — Should I-3 be expressed in `qa-standards` as a hard requirement or a soft warning?** Argument for hard: this was a real user-visible bug. Argument for soft: a Tiingo outage could trip it for legitimate reasons. Lean hard, with the I-3 short-circuit on missing thresholds as the safety valve.
- **Q3 — Do we want the script to also check `stock_scorecard_cache` for every stock the KOL touches?** Out of scope for now — Issue 2 is KOL-side. Track separately if/when the stocks page surfaces a similar mismatch.
