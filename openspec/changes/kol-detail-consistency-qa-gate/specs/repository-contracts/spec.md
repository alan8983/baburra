## ADDED Requirements

### Requirement: Synchronous scorecard recompute after scrape completion (R11)
After `completeScrapeJob` returns successfully in `src/domain/services/profile-scrape.service.ts`, the service SHALL `await computeKolScorecard(kolId)` synchronously before returning to the caller. The recompute SHALL be wrapped in `try/catch` with a `console.warn` on failure so a recompute error does not flip the scrape job's `completed` status.

The fire-and-forget read-through path (`enqueueKolScorecardCompute` in the win-rate API route) remains in place for ad-hoc page loads that happen between scrapes; it is no longer the primary mechanism for keeping the cache fresh after a write.

#### Scenario: Successful scrape leaves cache fresh
- **WHEN** `profile-scrape.service.ts` finishes processing all URLs and calls `completeScrapeJob`
- **THEN** the service awaits `computeKolScorecard(kolId)`, the resulting `kol_scorecard_cache` row has `stale = false` and `computed_at` within seconds of the scrape's completion timestamp, and the next page-load resolves to `{status: 'ready'}` without polling

#### Scenario: Recompute failure does not flip scrape status
- **WHEN** `completeScrapeJob` returns successfully but `computeKolScorecard` throws (e.g. Tiingo unreachable for every stock)
- **THEN** the error is logged via `console.warn`, the scrape job's status remains `completed`, the script's exit code is 0 from the scrape's perspective, and the consistency check (Q2 in qa-standards) is the layer that surfaces the cache miss to the operator

### Requirement: computeKolScorecard timeout respects price-repo fallback SLA (R12)
The per-stock `withTimeout` race inside `computeKolScorecard` (currently `COMPUTE_TIMEOUT_MS = 5_000` in `src/domain/services/scorecard.service.ts`) SHALL be set generously enough that `getStockPrices(ticker)` can complete its own internal stale-cache fallback path (`stock-price.repository.ts:329`) before the outer race rejects. The bound MUST be at least 30 seconds.

#### Scenario: Tiingo slow, stale cache present
- **WHEN** `computeKolScorecard` calls `getStockPrices(ticker)` for a stock whose Tiingo fetch takes 8–20 seconds and the price repo's stale cache has rows for that ticker
- **THEN** the outer race does not reject before the price repo returns the stale-cache rows, and `candlesByStock[stockId]` contains real candles instead of an empty array

#### Scenario: Tiingo permanently down, no stale cache
- **WHEN** `computeKolScorecard` calls `getStockPrices(ticker)` for a stock with no price-repo cache rows and Tiingo never responds
- **THEN** the outer race rejects after at most 30 seconds, `candlesByStock[stockId] = []`, the per-stock samples are classified `excluded`, and the rest of the compute proceeds (no global hang)

### Requirement: KOL detail page must request the full post set (R13)
`useKolPosts` callers on the KOL detail page (`src/app/(app)/kols/[id]/page.tsx`) SHALL pass `limit: 1000` so the in-memory aggregation that drives per-stock breakdowns, sentiment markers, and post lists reflects the same universe of posts as `computeKolScorecard`. The 20-post default in `listPosts` and the `usePosts` global list SHALL remain unchanged.

#### Scenario: KOL with 138 posts renders all 138
- **WHEN** the user navigates to a KOL detail page for a KOL with 138 posts spread across 30 unique stocks
- **THEN** the API call `GET /api/kols/[id]/posts?limit=1000` returns `total: 138`, the per-stock breakdown sums to 138 across all stock cards, and a stock with 126 associated posts displays "共 126 篇文章" not "共 18 篇文章"

#### Scenario: Global posts list is unaffected
- **WHEN** the user navigates to `/posts`
- **THEN** the API call `GET /api/posts` defaults to `limit=20` and returns paginated results, the same as before this change
