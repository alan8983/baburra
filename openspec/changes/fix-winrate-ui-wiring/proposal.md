## Why

PR #62 (`dynamic-volatility-threshold`) and PR #64 (`kol-performance-metrics-ui`) landed a complete win-rate pipeline — dynamic 1σ classifier, `hitRate`/SQR metrics, period selectors, and shared UI primitives — but the win-rate ring on the KOL detail page (and likely the dashboard widgets) still shows "—" for every KOL. Three compounding bugs prevent the data from reaching the UI:

1. **Sequential stock-price fetching causes API timeout.** `GET /api/kols/[id]/win-rate` iterates over every unique stock mentioned by the KOL **sequentially** (`for…of` + `await`). A KOL like "Gooaye 股癌" mentions 153 unique stocks across 39 posts — 153 sequential network calls easily exceed the serverless function timeout. The hook receives a 500, sets `data` to `undefined`, and the ring renders "—". By contrast, the posts API already uses `Promise.allSettled` for the same operation via `enrichPostsWithPriceChanges`.

2. **Missing `^TWII` index ticker breaks TW-market fallback.** The volatility calculator falls back to the same-market index when a ticker lacks sufficient own price history. For TW stocks, that index is `^TWII`. But `^TWII` has no row in the `stocks` table, so `resolveStock('^TWII')` returns `null`, `market` becomes `undefined`, and `getStockPrices` routes the request to Tiingo (US provider) instead of TWSE — which fails. The empty series produces `threshold = 0`, marking every TW stock without long own history as **excluded**. `SPY` (the US/CRYPTO fallback) works fine because it IS in the stocks table.

3. **Profile migration not applied.** The `default_win_rate_period` column migration (`20260411000000`) was created locally but never pushed to the remote DB. The profile repository's `.select(…, default_win_rate_period, …)` call triggers a PostgREST column-not-found error, breaking the profile API. This doesn't directly block win-rate display (the scorecard falls back to `DEFAULT_WIN_RATE_PERIOD`), but it degrades the user experience and pollutes error logs.

## What Changes

### 1. Parallelize stock-price fetching in win-rate API route
- Replace the sequential `for…of` loop with `Promise.allSettled` + per-stock timeout (5 s), matching the pattern in `enrichPostsWithPriceChanges`.
- Applies to `GET /api/kols/[id]/win-rate`. The stock route (`GET /api/stocks/[ticker]/win-rate`) only fetches one ticker so it's unaffected.

### 2. Fix TW-market index fallback
- Insert a `stocks` row for `^TWII` (market = `TW`) so that `resolveStock('^TWII')` succeeds and `getStockPrices` routes to the TWSE price client.
- Delivered as a SQL migration.

### 3. Harden profile repository against missing column
- Wrap the profile select in a fallback: if the query errors due to a missing column, retry without `default_win_rate_period` and return the default.
- This makes the profile API resilient regardless of whether the column migration has been applied yet.

## Scope

- **In scope:** The three fixes above, plus corresponding tests and type-check.
- **Out of scope:** Performance optimization of `computeWinRateStats` itself (sequential volatility-threshold lookups); that can be addressed in a follow-up change if needed.
