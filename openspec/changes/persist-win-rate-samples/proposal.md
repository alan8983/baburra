## Why

The win-rate pipeline built in `dynamic-volatility-threshold` + `kol-overall-performance-metrics` + `kol-performance-metrics-ui` is functionally complete but **stateless** — every call to `GET /api/kols/[id]/win-rate` or `GET /api/stocks/[ticker]/win-rate` recomputes everything from scratch:

1. Load up to 1000 posts for the KOL
2. Fetch prices for every unique stock (now parallel, but still N queries)
3. For each (post × stock × period) tuple: look up σ, classify, accumulate
4. Aggregate 4 buckets

With a KOL like "Gooaye 股癌" (39 posts, 153 unique stocks, up to 59 stocks in a single post), that's **hundreds of volatility lookups and thousands of classification ops per request** — most of which would produce the exact same result as the previous request, because the underlying inputs (post sentiment, stock prices before postedAt, σ anchored at postedAt) **don't change once a post is written**.

The current in-memory `VolatilityCache` helps within a single serverless instance, but:
- Cold starts invalidate it
- It doesn't persist classification results, only thresholds
- Every consumer (KOL scorecard, stock detail, dashboard, leaderboard) re-runs the full pipeline

This change **persists the classification result** (not just the threshold) in a new DB table. Once a `(post, stock, period)` sample has been classified, the row is stored forever. Win-rate and SQR are then computed via cheap SQL aggregates over that table. Incremental — new posts add new rows; existing rows are untouched. This also unblocks **per-stock accuracy breakdowns** that are currently disabled because "the dynamic 1σ classifier requires server-side σ lookup" (see `kol-scorecard.tsx:126-128` and `page.tsx:145-148`).

## What Changes

### New persistence layer
- Add `post_win_rate_samples` table keyed on `(post_id, stock_id, period_days)` storing the full classification result: `outcome`, `excess_return`, `threshold_value`, `threshold_source`, plus `computed_at`, `classifier_version`.
- Add `volatility_thresholds` table keyed on `(ticker, period_days, as_of_date)` — the durable version of the in-memory `VolatilityCache`. Shared across KOLs.

### Service rewrite
- Change `computeWinRateStats` to a read-first pipeline:
  1. Load cached samples for the requested post set in one query
  2. Classify only the missing `(post, stock, period)` tuples (sparse fill)
  3. Upsert the newly-classified rows
  4. Aggregate via SQL (or JS over the merged set) to produce `WinRateStats`
- Volatility lookup goes through a DB-backed provider first, falling back to on-demand compute → upsert.

### API route rewrite
- `GET /api/kols/[id]/win-rate` and `GET /api/stocks/[ticker]/win-rate` use SQL aggregates over `post_win_rate_samples`:
  - `hitRate`, `precision`, `sqr`, `avgExcessWin`, `avgExcessLose`, `sufficientData` — all computed directly via `COUNT` / `AVG` / `STDDEV_SAMP` grouped by period.
- For cold samples (no row yet), the route fills on-demand before aggregating. Subsequent requests are read-only.

### Invalidation
- Samples are immutable per `(post, stock, period, classifier_version)`. Invalidation is **append-only**: if the classifier changes, bump `classifier_version`; the aggregation query filters on the current version.
- When a post's sentiment or per-stock sentiment changes (AI re-analysis, manual edit), delete rows for that `post_id` and let the next read refill them.
- When a post is deleted or mirrored away, rows cascade via FK.

### Backfill / warmup
- One-time backfill job that walks existing posts and populates `post_win_rate_samples`. Idempotent; safe to re-run.
- Triggered via a new script `scripts/backfill-win-rate-samples.ts` (local use) or an admin API route.

### Unblock per-stock breakdown
- Now that samples are available, re-enable the per-(kol, stock) accuracy display on `KolStockSection` by adding a `bucketsByStock` field to the `GET /api/kols/[id]/win-rate` response.

## Capabilities

### New Capabilities
- `win-rate-persistence`: Durable storage of per-sample classification results and per-period volatility thresholds; contract between the service layer and the DB tables; invalidation rules for sample invalidation; classifier version gating.

### Modified Capabilities
- `win-rate-classification`: Service now reads from `post_win_rate_samples` first and only classifies missing tuples. Aggregation can run in SQL. Adds per-stock bucket support.

## Impact

- **Code added**:
  - `supabase/migrations/<ts>_add_win_rate_cache_tables.sql` (new tables + indexes)
  - `src/infrastructure/repositories/win-rate-sample.repository.ts` (read/write)
  - `src/infrastructure/repositories/volatility-threshold.repository.ts`
  - `src/infrastructure/providers/persistent-volatility.provider.ts` (implements `VolatilityProvider`, wraps DB cache + on-demand compute)
  - `scripts/backfill-win-rate-samples.ts`
  - Tests for the repositories, the updated service, and the API routes

- **Code modified**:
  - `src/domain/services/win-rate.service.ts` — read-first pipeline; still pure w.r.t. `VolatilityProvider` dependency injection; adds per-stock aggregation helper
  - `src/app/api/kols/[id]/win-rate/route.ts` — wire DB-backed provider, drop parallel stock-price prefetch (samples are either cached or computed lazily), add `bucketsByStock` to response
  - `src/app/api/stocks/[ticker]/win-rate/route.ts` — same
  - `src/app/api/dashboard/route.ts` — read cached samples for KOL win-rates (much cheaper)
  - `src/app/(app)/kols/[id]/_components/kol-scorecard.tsx` / `page.tsx` — re-enable per-stock breakdown using new `bucketsByStock`

- **Data**:
  - Two new tables. Expected row counts at current scale: `volatility_thresholds` ~10k rows (500 tickers × 4 periods × ~5 unique postedAt days/stock). `post_win_rate_samples` ~100k-1M rows (posts × avg stocks × 4 periods). Both keyed/indexed for point lookups and range scans by KOL.
  - Backfill one-time walk over existing ~5k posts; runs in minutes, idempotent.

- **Unchanged**:
  - The pure calculators (`win-rate.calculator.ts`, `volatility.calculator.ts`) — classification math is the truth; persistence wraps it
  - The wire format of `WinRateStats` at the API boundary
  - The UI components (other than the per-stock breakdown re-enablement, which is additive)

- **Out of scope**:
  - Streaming/push invalidation on price corrections (rare enough to handle with a manual clear-and-refill script)
  - Background recomputation workers — the read-first pipeline fills on demand; a cron warmup is nice-to-have, not required
  - Materialized-view-based aggregation (the SQL `GROUP BY` over indexed rows is plenty fast at current scale; revisit at 10M+ samples)
