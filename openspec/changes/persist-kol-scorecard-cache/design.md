## Context

Two layers of caching already exist for win-rate computation:

- **L1 `volatility_thresholds`** — σ by `(ticker, period_days, as_of_date)`.
- **L2 `post_win_rate_samples`** — classification outcome + σ-normalized excess return per `(post_id, stock_id, period_days, classifier_version)`.

Both were added in migration `20260414000002` to make classification idempotent and survive cold starts. They succeeded at that goal, but **aggregation** (Hit Rate, SQR, Return, per-stock breakdown) still happens in JavaScript on every API hit, which means the hot path still:

1. Reads every sample row for the KOL (~40 posts × N stocks × 4 periods).
2. For periods still pending (5d window not yet closed), runs the classifier again — which requires a Tiingo candle fetch if the candles aren't already cached.
3. Computes means, stdev, and σ-normalized ratios in memory.

Concurrently, the **Scorecard Return** is not aggregated server-side at all — the client averages `priceChange × sign(sentiment)` over whatever subset of the last 20 posts resolved within the 5 s Tiingo timeout. That subset differs across devices.

**Result on the live page** (Gooaye, 2026-04-14): SQR popover shows `— · —` because `winRateStats` never resolves before screenshot; 4-period Scorecard Return (+0.0 / −1.2 / +4.7 / —) disagrees with the per-stock NVDA card (−1.0 / −2.4 / −1.9 / —) even though 18 of 20 posts are NVDA.

The invalidation fan-out for a new scraped post is small (1 KOL + ≤ ~5 stocks), and a full KOL scorecard recompute over 40 posts takes < 50 ms of JS — cheap enough that we can always do full-row recomputes instead of incremental math.

## Goals / Non-Goals

**Goals:**

- Single deterministic source of truth for Return, Hit Rate, SQR, Precision, per-stock breakdown per KOL and per Stock.
- Read-through cache: API response time on a warm row ≤ 100 ms end-to-end.
- First paint on `/kols/[id]` shows a meaningful scorecard (not a 30 s row of em-dashes).
- Numbers do not change across devices or across reloads while the underlying posts are unchanged.
- Return uses the **same sample set** as Hit Rate / SQR — one cannot drift from the other.
- Nightly cron guarantees that newly-resolved price windows are reflected within 24 h of the price becoming available.

**Non-Goals:**

- Incremental / streaming aggregation. We always recompute the full row.
- External queue service (SQS, Inngest, Trigger.dev, etc.). The in-process refresh is small enough to live inside the Next.js serverless runtime.
- Solving the broader "cold KOL onboarding" UX (issue #1 part B about the initial 30 s wait) beyond returning `null` + async-filling. Dedicated proposal if the first-hit latency becomes a priority.
- Issue #3 (per-stock "see more" + `/kols/[id]/stocks/[ticker]`) and issue #4 (chart hover). Separate proposals.

## Decisions

### D1 — Aggregate cache schema

One JSONB-per-period row per entity.

```sql
CREATE TABLE kol_scorecard_cache (
  kol_id              UUID PRIMARY KEY REFERENCES kols(id) ON DELETE CASCADE,
  classifier_version  SMALLINT NOT NULL,
  day5                JSONB NOT NULL,   -- WinRateBucketPersisted (see below)
  day30               JSONB NOT NULL,
  day90               JSONB NOT NULL,
  day365              JSONB NOT NULL,
  buckets_by_stock    JSONB NOT NULL,   -- { [stockId]: { day5, day30, day90, day365 } }
  post_count          INTEGER NOT NULL,
  last_post_at        TIMESTAMPTZ,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stale               BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX kol_scorecard_cache_stale_idx
  ON kol_scorecard_cache (stale) WHERE stale = TRUE;
```

`stock_scorecard_cache` has the same shape with `stock_id` as PK, and `buckets_by_kol` instead of `buckets_by_stock`.

**Bucket blob (stored in each `dayN` JSONB):**

```ts
{
  total, winCount, loseCount, noiseCount, excludedCount,
  hitRate, precision,
  avgExcessWin, avgExcessLose, sqr,
  avgReturn,             // NEW — mean(price_change * sign(sentiment))
  returnSampleSize,      // NEW — count of posts contributing to avgReturn
  pendingCount,          // NEW — posts whose price window hasn't closed yet
  sufficientData, threshold
}
```

**Why JSONB per period, not normalised rows?** Read pattern is "give me everything for this KOL once" — no cross-row joins. JSONB keeps the row count low (1 per KOL) and payload serialisation cheap. The downside (you can't index inside JSONB efficiently) doesn't matter because all queries are PK lookups.

**Why `classifier_version` in the row, not in a composite PK?** Upgrading the classifier is a global event — we delete all rows and let them recompute lazily. Keeping it scalar keeps queries simple and prevents accidental double-cache storage across versions.

**Alternatives considered:**

- Materialised view over `post_win_rate_samples`. Rejected: can't express SQR cleanly across groups without a window CTE, and `REFRESH MATERIALIZED VIEW CONCURRENTLY` doesn't support partial refresh per-KOL — we'd either pay full refresh every event or every night.
- Redis / Upstash KV cache. Rejected: adds a new infra dependency for a few KB of data that's already in Postgres. PG row reads are ~5 ms on the existing connection pool.

### D2 — Extend `post_win_rate_samples` with raw price change

Return cannot be recovered from `excess_return` alone without knowing `threshold_value` — but we already store that. Still, for a cleaner aggregation query and parity with `PriceChangeStatusType` semantics:

```sql
ALTER TABLE post_win_rate_samples
  ADD COLUMN price_change           NUMERIC(14, 8),
  ADD COLUMN price_change_status    TEXT NOT NULL DEFAULT 'value'
    CHECK (price_change_status IN ('pending', 'no_data', 'value'));
```

`price_change_status` is the thing that was previously lost when `enrich-price-changes.ts` returned `null` due to a Tiingo timeout — now we persist "we asked, Tiingo said no" vs "window not closed yet" vs "we have it". Aggregation can show a `pendingCount` hint in the UI (which the current client never did).

**Backfill**: a one-off migration script recomputes `price_change` for existing rows from the candles. Skippable if samples-version is bumped; since we're not bumping `classifier_version`, we backfill.

### D3 — Compute service

Single entry point, used by all three writers:

```ts
// src/domain/services/scorecard.service.ts
async function computeKolScorecard(kolId: string): Promise<KolScorecard>;
async function computeStockScorecard(stockId: string): Promise<StockScorecard>;

// Internal:
// 1. loadSamplesByKol(kolId, CLASSIFIER_VERSION)
// 2. classifyAndUpsertMissing(...)  // existing code path
// 3. aggregateBucket(...) × 4 periods  // existing code path
// 4. aggregateReturn(...) × 4 periods   // NEW — simple mean
// 5. group by stock → buckets_by_stock
// 6. upsert into kol_scorecard_cache, set stale = FALSE, computed_at = NOW()
```

The aggregation step is already ~70% of `/api/kols/[id]/win-rate/route.ts`. The refactor lifts the math into the service; the API route becomes a thin read + fallback wrapper.

### D4 — Invalidation: full row, triggered in three places

**Granularity**: option (a) from exploration — whole row blown, whole row recomputed.

**Write-side hooks** (places that must call `invalidateScorecardsForPost`):

```
┌───────────────────────────────────────────────────────────────┐
│ Site                                  │ Invalidates           │
│───────────────────────────────────────┼──────────────────────│
│ createPostAtomic (scrape ingestion)   │ kol[A], stock[Xi]∀i  │
│ deletePostPromoteMirror (dedup)       │ kol[A], stock[Xi]∀i  │
│ reanalyzePost / reanalyzeBatch        │ kol[A], stock[Xi]∀i  │
│ cron/refresh-scorecards (nightly)     │ all active kol+stock │
└───────────────────────────────────────────────────────────────┘
```

"Active" = has posts in the last 365 days (bounded).

**Invalidation implementation**: `UPDATE ... SET stale = TRUE WHERE kol_id = $1`. The actual recompute happens:

- **Post-ingest**: synchronous at end of `createPostAtomic` transaction (outside the transaction boundary so a slow recompute doesn't lock the insert path; errors are logged, not fatal). Typical compute = 50 ms + upstream candle fetch where needed.
- **Cron**: iterates stale rows and active KOLs, recomputes sequentially with a time budget (say 55 s per invocation; Vercel cron tolerates up to 60 s). If it runs out of time, the remaining rows stay `stale = TRUE` and the API read-through path handles them.

**Why not a proper queue?** Volume is tiny — we're talking tens of KOLs, hundreds of stocks, a handful of scrape events per day. Adding Inngest / BullMQ / SQS is real infra for no real payoff. If volume 10×s, revisit.

### D5 — Read-through path with async fallback

```
GET /api/kols/[id]/win-rate
  ├── SELECT * FROM kol_scorecard_cache
  │     WHERE kol_id = $1 AND classifier_version = $2 AND stale = FALSE
  │
  ├── HIT  → return 200 with blob
  │
  └── MISS → return 200 with { status: 'computing', computedAt: null }
             + enqueue refresh via setImmediate(fireAndForget(computeKolScorecard))
             + React Query retries every 3 s until status changes
```

**Why not block and compute synchronously on miss?** That reproduces today's 30 s stall. We lose nothing — React Query already re-polls, and the user sees a skeleton instead of a white box of em-dashes.

**Why 200 not 202?** Consumers are `fetch` / React Query; they treat non-2xx as errors. A 200 with `{ status: 'computing' }` keeps the hook clean. Response type becomes a discriminated union:

```ts
type ScorecardResponse =
  | ({ status: 'ready'; computedAt: string } & ScorecardBlob)
  | { status: 'computing'; computedAt: null };
```

**Stale rows**: `stale = TRUE` counts as miss. A user hitting a freshly-invalidated row sees `status: 'computing'` until the background recompute lands.

### D6 — Lazy TTL refresh (no external cron)

The project runs on Vercel Hobby, where `vercel.json` `crons` entries are rejected. Rather than upgrade or introduce an external scheduler, we lean on two properties already in the design:

1. **Scraper ingestion writes are the invalidation signal.** When a post is inserted, `stale = TRUE` is set and a background recompute is enqueued. The cache is correct at the exact moment it needs to be.
2. **The read-through path handles staleness.** Any row with `stale = TRUE` is treated as a miss and recomputed; any row with `computed_at < NOW() - INTERVAL '12h'` is also treated as stale. The first visitor after the TTL boundary triggers the refresh.

```
repository.getKolScorecard(kolId):
  SELECT *, (computed_at < NOW() - INTERVAL '12h') AS ttl_stale
  FROM kol_scorecard_cache WHERE kol_id = ? AND classifier_version = ?

  if not found → return null (miss)
  if stale OR ttl_stale → return null (miss) and leave the row for the recompute to overwrite
  else → return the blob
```

**TTL choice (12 h)**: Tiingo EOD data settles around midnight UTC; a 12 h TTL guarantees that at least one daily refresh window crosses the EOD boundary, so any price window that closed overnight is reflected the first time someone visits the page the next day. Trading off against: re-compute cost per visitor per day (cheap) and freshness (good enough — scorecard data isn't realtime).

**Why not add `/api/cron/refresh-scorecards` anyway?** Because the endpoint without a schedule is dead code we'd have to maintain. If proactive refresh becomes necessary, the cleanest path forward is:

- **Supabase `pg_cron`** — one SQL block flips `stale = TRUE` nightly; read-through recomputes. Zero new services, free on the current plan.
- **Vercel Pro** — add the `crons` block in `vercel.json` and a thin endpoint that iterates stale rows.

Both are single-file additions on top of what lands in this change. Deferred until there's evidence the TTL alone is insufficient.

**Authentication**: not applicable — no cron endpoint is exposed.

### D7 — Client cleanup

Delete:

- `calcPeriodAvg` in `src/app/(app)/kols/[id]/_components/kol-scorecard.tsx`
- `calcPeriodStats` in `src/app/(app)/kols/[id]/page.tsx`
- `src/app/api/kols/[id]/return-rate/route.ts` (unused since before this proposal)
- The 20-post-window inheritance in `useKolPosts`: no longer affects Return display, though the hook itself stays (posts list still needs it).

Wire:

- `KolScorecard` and `KolStockSection` read `avgReturn` and `avgReturnSampleSize` from the cache response.
- `community-accuracy-card.tsx` (`/stocks/[ticker]`) reads from `stock_scorecard_cache` via a new hook `useStockScorecard(ticker)`.
- `performance-metrics-popover.tsx:72-78`: when `bucket.sqr === null`, render a single `—`, not `— · —`. Small diff, shipped in the same PR.

React Query settings on the scorecard hooks: `staleTime: 5 min`, `refetchInterval` disabled except when `data.status === 'computing'` where it polls every 3 s for up to 30 s then gives up.

## Risks / Trade-offs

- **[Cold KOL onboarding still feels slow]** → The first visitor to a newly-scraped KOL still triggers a 30 s background compute; they just see a skeleton instead of a wait. Mitigation: scrape ingestion pre-warms the cache for the new KOL before the next user hits the page — by the time a human navigates, the row is often ready.
- **[Backfill price_change on existing samples]** → One-off script needs to run after the migration. If it's skipped, aggregated `avgReturn` for pre-existing rows stays null until they're re-classified by next scrape/reanalyze. Mitigation: explicit backfill task in `tasks.md`; verify row count matches post_win_rate_samples count before marking done.
- **[stale rows pile up if cron fails]** → A broken cron means the `stale = TRUE` rows never get recomputed by the cron path, but user reads still trigger recompute. Mitigation: health-check endpoint counts stale rows older than 48 h and alerts via existing logging.
- **[Classifier version bumps are a cache-wide event]** → Bumping `CLASSIFIER_VERSION` effectively wipes both caches (WHERE clause won't match). That's the correct behavior, but "my scorecard went blank" will happen to everyone at once. Mitigation: run a backfill pass immediately after bumping classifier version; don't deploy the bump without it.
- **[Polling is wasteful]** → Every `status: 'computing'` response means a background compute is in progress and client polls every 3 s. If 50 users hit a freshly-scraped cold KOL simultaneously, we'll get 50 parallel computes. Mitigation: an in-memory lock `computingKolIds: Set<string>` in the compute service dedupes concurrent calls for the same key — parallel callers skip to the poll path.
- **[Return now has a `pendingCount` concept users haven't seen before]** → The UI previously hid pending posts silently. With the new blob, `pendingCount > 0` is visible. Mitigation: show as a small annotation (`"5d Return +2.3% · 3 件待計算"`) rather than a warning — matches the existing `<Clock />` iconography used when `allPending === true`.

## Migration Plan

1. Ship the migration adding both cache tables + `price_change` columns. Tables start empty. `post_win_rate_samples.price_change_status` defaults to `'value'` for existing rows (safe — existing rows are the ones where classification succeeded).
2. Run backfill: script iterates `post_win_rate_samples` rows with `price_change IS NULL`, recomputes from candles via the existing provider, upserts.
3. Deploy the new service + read-through endpoint behind a feature flag (`USE_SCORECARD_CACHE`). Old clients continue computing on the client; new responses populate the cache.
4. Enable scraper-side invalidation hook.
5. Enable cron.
6. Flip the feature flag on; client reads from cache. Monitor for 48 h.
7. Delete old client-side aggregation code + the `/api/kols/[id]/return-rate` route.
8. Remove the feature flag in a follow-up.

**Rollback**: feature flag off = clients fall back to computing from raw posts. Cache tables stay populated but unread; no data loss.
