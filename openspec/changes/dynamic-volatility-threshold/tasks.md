## 1. Price Data Readiness

- [x] 1.1 Verify `stock_prices` historical depth for representative tickers (mega cap, small cap, crypto, recent IPO, TW stock); document gaps
- [x] 1.2 Verify or add DB index on `stock_prices(stock_id, date)` (likely already implied by upsert key)
- [x] 1.3 Add a repository helper `getStockPriceSeries(ticker, { from, to }): Promise<PriceSeriesPoint[]>` in `stock-price.repository.ts` that exposes `{ date, close }` rows directly without the chart-shape transform; reuse existing cache + Tiingo/TWSE backfill
- [x] 1.4 Add an index loader for `^TWII` (TWSE) and `SPY` (Tiingo) — either via `getStockPriceSeries` after seeding their `stocks` rows, or via a small dedicated `index-prices.ts` if those tickers don't fit the `stocks` table

## 2. Volatility Calculator Module

- [x] 2.1 Create `src/domain/calculators/volatility.calculator.ts` with types: `PeriodDays`, `PriceSeriesPoint`, `VolatilityProvider`, `VolatilityResult`, `UnsupportedMarketError`
- [x] 2.2 Implement pure `calculateRealizedVolatility(prices, periodDays)` using overlapping N-day returns and sample stdev
- [x] 2.3 Implement lookback resolver: 5d/30d → 1y, 90d → 2y, 365d → 3y (calendar offsets)
- [x] 2.4 Implement `getVolatilityThreshold({ ticker, periodDays, asOfDate, provider })` with strict `< asOfDate` filter on the price series
- [x] 2.5 Implement IPO fallback: detect insufficient series length, switch to same-market index (TWII for TW, SPY for US/CRYPTO), return `source: 'index-fallback'`
- [x] 2.6 Throw `UnsupportedMarketError` for `'HK'` (or unknown markets)
- [x] 2.7 Add in-memory LRU cache (~1000 entries) keyed by `(ticker, periodDays, asOfDate-YYYY-MM-DD)`
- [x] 2.8 Re-export the new module from `src/domain/calculators/index.ts`

## 3. Volatility Calculator Tests

- [x] 3.1 Pure σ on a known synthetic series matches a hand-computed value
- [x] 3.2 Sample count for overlapping returns equals `series.length - periodDays`
- [x] 3.3 `asOfDate` is exclusive — no row with `date >= asOfDate` enters the calculation
- [x] 3.4 Insufficient ticker history triggers index fallback and marks `source = 'index-fallback'`
- [x] 3.5 Sufficient history uses ticker and marks `source = 'ticker'`
- [x] 3.6 `'HK'` market raises `UnsupportedMarketError`
- [x] 3.7 Cache hit does not re-invoke the provider for the same `(ticker, periodDays, asOfDate)`

## 4. Win-Rate Calculator Module

- [x] 4.1 Create `src/domain/calculators/win-rate.calculator.ts` with types `WinRateOutcome`, `WinRateBucket`, `WinRateStats`
- [x] 4.2 Implement pure `classifyOutcome({ sentiment, priceChange, threshold })` that returns `'win' | 'lose' | 'noise' | 'excluded'`
- [x] 4.3 Encode the Noise band as the closed interval `[-threshold, +threshold]`
- [x] 4.4 Encode Bullish/Bearish via `sentiment > 0` / `sentiment < 0`; `sentiment === 0` → `excluded`
- [x] 4.5 Implement pure `aggregateBucket(outcomes, thresholds): WinRateBucket` with `winRate = winCount / (winCount + loseCount)` (null when denom is 0) and a representative threshold (median)
- [x] 4.6 Re-export from `src/domain/calculators/index.ts`

## 5. Win-Rate Calculator Tests

- [x] 5.1 Bullish post with `priceChange > +1σ` → `'win'`
- [x] 5.2 Bullish post with `priceChange` in `[-1σ, +1σ]` → `'noise'`
- [x] 5.3 Bullish post with `priceChange < -1σ` → `'lose'`
- [x] 5.4 Bearish post with `priceChange < -1σ` → `'win'`
- [x] 5.5 Bearish post with `priceChange > +1σ` → `'lose'`
- [x] 5.6 Neutral post (`sentiment === 0`) → `'excluded'` regardless of priceChange
- [x] 5.7 `priceChange === null` → `'excluded'`
- [x] 5.8 Sentiment strength (`+1` vs `+3`) does not affect outcome
- [x] 5.9 `aggregateBucket` excludes Noise from the win-rate denominator
- [x] 5.10 `aggregateBucket` returns `winRate === null` when denominator is 0
- [x] 5.11 `aggregateBucket` representative threshold is the median of inputs

## 6. WinRate Service

- [x] 6.1 Create `src/domain/services/win-rate.service.ts` exposing `computeWinRateStats({ posts, provider })`
- [x] 6.2 Implement `StockPriceVolatilityProvider` (in `infrastructure/`) wrapping `getStockPriceSeries` + `stocks.market` lookup
- [x] 6.3 For each (post, stock, period), look up the per-post threshold via `getVolatilityThreshold` and classify; honor `priceChanges[stockId][dayN]` and the `dayNStatus` field
- [x] 6.4 Use the per-stock sentiment override (`PostStockLink.sentiment ?? post.sentiment`), matching how `return-rate` already handles it
- [x] 6.5 Return a fully-populated `WinRateStats` (4 buckets), with bucket thresholds aggregated as median
- [x] 6.6 Service tests: inject a fake `VolatilityProvider`, feed synthetic posts, assert bucket counts and win rates

## 7. API Routes + Hooks

- [x] 7.1 Add `src/app/api/kols/[id]/win-rate/route.ts` — load posts (mirroring `/return-rate`), build per-stock candles map, call `computeWinRateStats`, return `WinRateStats`
- [x] 7.2 Add `src/app/api/stocks/[ticker]/win-rate/route.ts` — analogous
- [x] 7.3 Add `API_ROUTES.KOL_WIN_RATE(id)` and `API_ROUTES.STOCK_WIN_RATE(ticker)` to `src/lib/constants/routes.ts`
- [x] 7.4 Add `src/hooks/use-win-rate.ts` with `useKolWinRate(id)` and `useStockWinRate(ticker)` (React Query, hierarchical query keys)
- [x] 7.5 Smoke-test the routes by calling them in the running dev server with a known KOL/stock id

## 8. Consumer Migration

- [x] 8.1 `src/app/(app)/kols/[id]/_components/kol-scorecard.tsx`: replace the inline `winRate / winCount / totalCalls` `useMemo` with `useKolWinRate`; render the day30 bucket; show `±X% σ` next to the ring (and `(index)` if `source === 'index-fallback'`)
- [x] 8.2 `src/app/(app)/stocks/[ticker]/page.tsx`: locate the analogous inline win-rate computation and replace with `useStockWinRate`
- [x] 8.3 Refactor the dashboard server component (`src/app/(app)/dashboard/page.tsx`) to compute aggregates once via `computeWinRateStats` and pass `winRateByKol` / `pulseStats` props down
- [x] 8.4 `src/app/(app)/dashboard/_components/portfolio-pulse.tsx`: drop the inline `useMemo` win-rate math; consume the new prop
- [x] 8.5 `src/app/(app)/dashboard/_components/kol-leaderboard.tsx`: drop the inline `useMemo` win-rate math; consume the new prop; sort by `winRate`
- [x] 8.6 Verify there are no remaining call sites computing `change > 0 ? wins++ : ...` outside the new modules (`grep` sweep)

## 9. Documentation

- [x] 9.1 Rewrite `docs/INVARIANTS.md` W1 to describe the implemented dynamic 1σ rule, no-look-ahead anchor, IPO/index fallback, and Noise/Excluded semantics; mark the prior fixed-2% example as superseded
- [x] 9.2 Add `WinRateStats` and the new endpoints to `openspec/specs/api-contracts/spec.md`
- [x] 9.3 Add the win-rate calculator to `docs/DOMAIN_MODELS.md` (or wherever calculators are listed) if there is such a section

## 10. Validation & Rollout

- [x] 10.1 Snapshot today's rendered win rates for 5 KOLs (mix of mega cap, small cap, crypto, TW, recent IPO) and 5 stocks; record `winCount/totalCalls`
- [x] 10.2 Apply the change end-to-end and capture the new values for the same set; document the diffs and confirm direction-of-change makes sense
- [x] 10.3 Run `npm test`, `npm run type-check`, `npm run lint`
- [x] 10.4 Manual UI smoke: load a KOL detail page, the dashboard, and a stock detail page; confirm the threshold annotation renders, no console errors, hooks return data
- [x] 10.5 Archive the change via `/opsx:archive dynamic-volatility-threshold`
