## Context

After the `fix-winrate-ui-wiring` hotfix landed, the win-rate API is correct but still expensive. For every request we:

1. `listPosts({ kolId, limit: 1000 })` — one Supabase query, fast
2. Fetch stock prices for each unique stock (now parallel, up to ~150 stocks per KOL) — per-stock `resolveStock` + `readCachedPrices` + potentially TWSE/Tiingo API calls
3. `computeWinRateStats`:
   - For every `(post, stock, period)` tuple, call `getVolatilityThreshold` — in-memory LRU cache hits reduce this to pure math, misses hit the DB + price client + stdev compute
   - Classify the tuple into win/lose/noise/excluded
   - Aggregate into 4 period buckets

The classification result for a given `(post_id, stock_id, period_days)` is **deterministic and immutable** once:
- The post's `posted_at` is set (never changes after creation)
- The post's `sentiment` and per-stock `post_stocks.sentiment` are decided (only changes on AI re-analysis or manual edit)
- The historical price series up to `posted_at - 1` is complete (backfill fills gaps, but values don't rewrite)
- The classifier logic hasn't been bumped (versioned)

Nothing in the current pipeline exploits that immutability. This change adds the DB tables that do, plus the read/write plumbing.

`post_stocks` already has a `sentiment` column; `posts` has `sentiment`; together they are the exact pair the classifier consumes. Both have triggers on change would be heavy — we use a simpler strategy: delete-on-write (below).

## Goals / Non-Goals

**Goals**
- Persistent cache of per-sample classification results, keyed by `(post_id, stock_id, period_days)`, aggregated via SQL.
- Persistent cache of volatility thresholds, keyed by `(ticker, period_days, as_of_date)`, shared across all KOLs.
- Read-first service: aggregate what's cached, lazily fill what's missing, upsert, return.
- Sub-100ms warm-cache reads for win-rate API, independent of KOL size.
- Per-stock breakdown unblocked.

**Non-Goals**
- Real-time recomputation on price corrections (rare; handled by manual "clear cache for ticker X" script if needed).
- Materialized views / pre-aggregated bucket tables (premature at current scale; `SUM()` over `< 1M` indexed rows is already fast).
- Changing the classifier math or `WinRateStats` wire format.
- Async background fill workers. On-demand fill is enough; cron warmup is optional.

## Decisions

### D1. Two tables, not one

```sql
CREATE TABLE volatility_thresholds (
  ticker TEXT NOT NULL,
  period_days SMALLINT NOT NULL CHECK (period_days IN (5, 30, 90, 365)),
  as_of_date DATE NOT NULL,
  value NUMERIC(10, 8) NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ticker', 'index-fallback')),
  sample_size INT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticker, period_days, as_of_date)
);

CREATE TABLE post_win_rate_samples (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  period_days SMALLINT NOT NULL CHECK (period_days IN (5, 30, 90, 365)),
  outcome TEXT NOT NULL CHECK (outcome IN ('win', 'lose', 'noise', 'excluded')),
  excess_return NUMERIC(12, 8),          -- NULL for excluded
  threshold_value NUMERIC(10, 8),        -- NULL for excluded
  threshold_source TEXT CHECK (threshold_source IN ('ticker', 'index-fallback')),
  classifier_version SMALLINT NOT NULL DEFAULT 1,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, stock_id, period_days, classifier_version)
);

CREATE INDEX post_win_rate_samples_post_id_idx ON post_win_rate_samples (post_id);
CREATE INDEX post_win_rate_samples_stock_id_idx ON post_win_rate_samples (stock_id);
```

**Rationale**
- Volatility thresholds are shared across many KOLs (same ticker, same date → same threshold). Separate table avoids duplicating the value on every sample row.
- Samples include `excess_return` and `threshold_value` materialized into the row so SQL aggregates don't need to join back to `volatility_thresholds`. Small storage cost, big read simplification.
- `classifier_version` gates invalidation: if we change the classifier, bump the const and old rows are ignored (not deleted — kept for reproducibility).

**Alternatives considered**
- Single table with `threshold` inlined: duplicates ~60 bytes across ~M rows → ~60 MB wasted. Not worth the minor simplicity.
- Materialized view for bucket aggregates: adds refresh complexity; `SUM`/`COUNT` over the index is already < 50 ms at current scale.

### D2. Read-first service pipeline

```
computeWinRateStats(posts, provider, repo):
  1. samples_cached = repo.loadSamples(postIds, classifier_version)   // 1 query
  2. missing = [] for each (post, stock, period) not in samples_cached
  3. for each missing tuple:
       threshold = provider.getThreshold(ticker, period, postedAt)    // DB hit, then compute
       outcome = classifyOutcome(sentiment, priceChange, threshold.value)
       excessReturn = computeExcessReturn(…)
       samples_fresh.push(row)
  4. repo.upsertSamples(samples_fresh)                                // batch upsert
  5. all_samples = samples_cached ∪ samples_fresh
  6. aggregate per period → WinRateStats
```

- Step 1 is a single `SELECT … WHERE post_id IN (…) AND classifier_version = $1`.
- Step 4 uses `INSERT … ON CONFLICT DO UPDATE` for idempotency — if two requests race, the last write wins but the value is identical.
- Aggregation stays in JS for now (easy, correct, testable). We can push it to SQL later if the join-aggregate path becomes hot.

### D3. Persistent `VolatilityProvider`

New `PersistentVolatilityProvider implements VolatilityProvider`:
1. Check `volatility_thresholds` for `(ticker, period, as_of_date)` → return if hit
2. Fall through to `StockPriceVolatilityProvider` logic to compute
3. Upsert into `volatility_thresholds`
4. Return

The existing in-memory `VolatilityCache` stays as L1 (inside `getVolatilityThreshold`). The DB table is L2. Cold starts hit L2 instead of recomputing.

### D4. Invalidation strategy: delete-on-write, append-on-compute

**What can change (and triggers invalidation)**
- Post's `sentiment` updated by AI re-analysis or manual edit → delete all rows `WHERE post_id = $1`. Next read refills.
- `post_stocks.sentiment` changed for a specific stock → delete rows `WHERE post_id = $1 AND stock_id = $2`.
- Post deleted → ON DELETE CASCADE handles it.
- Stock deleted → ON DELETE CASCADE handles it.
- Price series backfilled for dates < posted_at (rare — e.g., TWSE late corrections) → manual clear script targeting affected (stock_id, as_of_date range).

**What cannot change (no invalidation needed)**
- Post's `posted_at` (immutable)
- Historical price rows with `date < posted_at` that already exist (Tiingo/TWSE generally append-only)
- The volatility threshold for a given `(ticker, period, as_of_date)` (deterministic)

**Classifier version bump**
- `MIN_RESOLVED_POSTS_PER_PERIOD`, the noise-band formula, the 1σ multiplier, etc. are all controlled by the pure calculator. If we change any of them, bump `CLASSIFIER_VERSION` constant in `win-rate.calculator.ts`. Queries filter on the current version; old rows become invisible. An opt-in backfill regenerates at the new version.

### D5. Invalidation hooks

Two places in the codebase already write to `posts.sentiment` / `post_stocks.sentiment`:
- `src/infrastructure/repositories/post.repository.ts` `updatePostSentiment` and variants
- The AI re-analysis batch in `src/app/api/posts/[id]/reanalyze/route.ts` (or wherever it lives)

Add a post-write hook: after any sentiment update, call `winRateSampleRepo.invalidateByPost(postId)`. Implementation is a single `DELETE` statement. Fire-and-forget.

**Alternative considered**: a SQL trigger on `posts.sentiment` UPDATE. Rejected because (a) triggers are invisible to the app layer and surprise future maintainers, (b) the sentiment column is also updated by seed scripts where we don't want cache invalidation side-effects, (c) we want the hook in JS where it's testable.

### D6. Backfill strategy

One-time script `scripts/backfill-win-rate-samples.ts`:
- Pages through all posts with `posted_at < now()`
- For each batch, runs the read-first pipeline — which fills the cache as a side effect
- Reports progress, safe to interrupt and resume (the cache check skips already-computed tuples)

Runs in minutes at current scale (~5k posts × ~3 stocks avg × 4 periods = ~60k samples, most of which share thresholds).

### D7. Per-stock breakdown

The current `WinRateStats` shape stays the same; we add an optional `bucketsByStock: Record<string, WinRateStats>` to the `GET /api/kols/[id]/win-rate` response. Computed by the same aggregation path, grouped by `stock_id` instead of (or in addition to) the global buckets.

Consumers that don't care (dashboard, leaderboard) ignore the field. `KolStockSection` on the detail page re-enables its per-stock ring from this data.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Wrong invalidation → stale win-rate after sentiment update | Hook covers the two known write paths; add integration test asserting `invalidate` is called |
| Backfill writes wrong values due to bug in new pipeline | Run with `DRY_RUN=1` flag first; compare to current on-the-fly output for a sample KOL |
| Volatility table grows unbounded over years | At 500 tickers × 4 periods × 250 trading days/yr × 5 years = 2.5 M rows, ~500 MB. Acceptable. Add partition by `as_of_date` if ever needed. |
| `post_win_rate_samples` cascade on stock delete loses history | Stocks are rarely deleted; when they are, the samples aren't meaningful anyway. Acceptable. |
| Two concurrent requests double-compute the same missing tuple | Upsert is idempotent; last write wins with identical payload. No correctness hazard. |

## Migration Plan

1. Ship the migration + empty tables. No behavior change.
2. Ship the new providers + repos + classifier version constant. Still no behavior change (old provider path remains default).
3. Flip `/api/kols/[id]/win-rate` and `/api/stocks/[ticker]/win-rate` to the persistent provider behind `USE_WIN_RATE_SAMPLE_CACHE` env flag (default ON in dev, OFF in prod at first).
4. Run backfill script in prod to warm the cache.
5. Flip prod flag ON.
6. Remove the flag and the sequential fallback path once stable for a week.

Dashboard endpoint gets the same treatment in the same sequence.
