## Why

Return, Hit Rate, and SQR on the KOL and Stock scorecards are currently recomputed on every page view — either client-side from a 20-post window (Return, which drifts across devices) or server-side from raw sample rows with no aggregate cache (Hit Rate / SQR, which takes 30+ s on cold hits and leaves the UI showing "— · —" until it resolves). The per-sample cache from `persist-win-rate-samples` made classification cheap, but aggregation is still synchronous on the read path. A durable aggregate layer on top of the existing samples makes reads O(1), stops devices from disagreeing, and removes the silent Tiingo timeout dropouts that currently bias the numbers.

## What Changes

- New tables `kol_scorecard_cache` and `stock_scorecard_cache` holding a pre-aggregated per-period blob (Return, Hit Rate, SQR, Precision, threshold, per-stock breakdown) per KOL / Stock, versioned by `classifier_version`.
- Extend `post_win_rate_samples` with `price_change` and `price_change_status` columns so Return aggregates from the same row set as Hit Rate and never reads candles at API time.
- Extract win-rate + return aggregation into a single service (`computeKolScorecard`, `computeStockScorecard`) callable from two sites:
  - `GET /api/kols/[id]/win-rate` and a new `GET /api/stocks/[ticker]/scorecard` — read-through, miss returns `{ status: 'computing' }` + enqueues a refresh (no 30 s synchronous block).
  - Scrape ingestion — on post insert, mark the KOL row and every referenced Stock row `stale = TRUE` and enqueue recompute.
- **Lazy TTL refresh** instead of a scheduled cron: any cache row with `computed_at < NOW() - INTERVAL '12h'` is treated as stale by the read-through path. This avoids the Vercel-Hobby cron restriction (Crons are Pro-only) while still guaranteeing that data seen by users is at most 12 h behind the underlying samples. Rows no one visits stay cold — no one's misled.
- Invalidation is full-row (scope option a): a new post by KOL A invalidates `kol_scorecard_cache[A]` and `stock_scorecard_cache[Xi]` for every Xi in the post. A post about Stock X by KOL B does not touch A's KOL cache.
- Client: `KolScorecard`, `KolStockSection`, and `community-accuracy-card.tsx` read from the cache blob. Delete client-side `calcPeriodAvg` / `calcPeriodStats`. The unused `/api/kols/[id]/return-rate` route is removed.
- Fix the cosmetic `— · —` bug in `performance-metrics-popover.tsx` — suppress the `· label` span when `sqr === null`.
- **BREAKING** (internal only — no external consumers): the `/api/kols/[id]/win-rate` response may return `null` for a KOL with no cache row yet. Clients treat `null` as "computing" and re-poll via React Query.

## Capabilities

### New Capabilities
- `kol-scorecard`: the durable aggregate cache of per-KOL performance metrics (Return, Hit Rate, SQR, Precision, per-stock breakdown) plus its invalidation + refresh contract.
- `stock-scorecard`: the durable aggregate cache of per-Stock community performance metrics, sharing the same invalidation and cron infrastructure as `kol-scorecard`.

### Modified Capabilities
- `api-contracts`: `GET /api/kols/[id]/win-rate` changes from "compute on every hit" to "read-through cache; return `null` + enqueue on miss". New `GET /api/stocks/[ticker]/scorecard`. Remove `GET /api/kols/[id]/return-rate` (currently unused).
- `data-models`: adds `kol_scorecard_cache` and `stock_scorecard_cache` tables; extends `post_win_rate_samples` with `price_change` + `price_change_status`.

## Impact

- DB: one migration adding two tables plus two columns on an existing table. Backfill job required so pre-existing sample rows get `price_change` populated.
- API: read path for `/api/kols/[id]/win-rate` becomes a single indexed read. Response shape gains a top-level `computedAt` and gains a `null` possibility on cold KOLs.
- Scraper pipeline: adds `invalidateScorecardsForPost(post)` hook after post + post_stocks insert. Adds an enqueue call into an in-process refresh queue (no new external queue service).
- Cron: **no Vercel Cron required.** Lazy TTL refresh handles staleness on the read path. If proactive refresh becomes important later, a Supabase `pg_cron` job or a Vercel Pro upgrade can bolt on without schema changes.
- Client: `KolScorecard`, `KolStockSection`, and `CommunityAccuracyCard` lose their per-render aggregation; `calcPeriodAvg` and `calcPeriodStats` are deleted. React Query refetch interval on the win-rate / scorecard hooks increases (cache rows are stable, no point re-polling tight).
- Removed: `src/app/api/kols/[id]/return-rate/route.ts` (unused).
