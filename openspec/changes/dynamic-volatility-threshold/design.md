## Context

Win rate is rendered in at least four places today, each with its own inline computation:

- `kol-scorecard.tsx` — `nonNeutral.filter(p => p.priceChanges.day30 != null)`, win = directional sign match on day30, ratio = `wins / nonNeutral.length`.
- `portfolio-pulse.tsx` — same pattern, falls back to `day5` when `day30` is null.
- `kol-leaderboard.tsx` — same pattern, day30 with day5 fallback, sorts by ratio.
- `stocks/[ticker]/page.tsx` — analogous (TBD during implementation; pattern is consistent).

Common ground: all four use the project's `Sentiment` type (`-3..+3` integers, `0` = Neutral), all four read `priceChanges` from `PostWithPriceChanges`, all four ignore Neutral, none of them have a Noise band, and none of them are tested. There is no `win-rate.calculator.ts` and no `WIN_RATE_THRESHOLD` constant — the snippet in `docs/INVARIANTS.md` is example code.

Price data lives in `stock_prices`, accessed via `getStockPrices(ticker, { startDate, endDate })`, which dispatches by `stocks.market` to TWSE for `'TW'` and Tiingo for `'US'`/`'CRYPTO'` and is cached in Supabase. `stocks.market` is the source of truth for market identification. The existing post `posted_at` is the natural anchor.

## Goals / Non-Goals

**Goals:**
- One pure, tested `win-rate.calculator.ts` that every consumer site uses, removing the four duplicated inline computations.
- Dynamic threshold = 1σ of realized N-day returns, computed per `(ticker, period, posted_at)`, no √T scaling.
- Strict no-look-ahead (lookback ends *strictly before* `posted_at`).
- IPO fallback to a single same-market index, surfaced in the response so it's visible.
- Server-computed `WinRateStats` exposed via two API routes + hooks; the dashboard widgets that currently take a flat `posts` prop also switch to server math, eliminating drift.
- All math is deterministic and unit-testable as pure functions; I/O lives at the boundary.

**Non-Goals:**
- Replacing `return-rate.calculator.ts` or `/return-rate` routes — average return remains a distinct metric.
- Tuning k by backtest (k=1 hardcoded).
- Confidence intervals, GARCH, Newey-West.
- HK market support (currently unsupported in `getStockPrices`; we throw a typed error).
- Cross-period aggregation rules (e.g., overall KOL win rate across 5d/30d/90d/365d) — separate change.

## Decisions

### D1. Threshold formula: `1σ` of realized N-day returns (k=1)
Same as the brief. Rationale: ~68% of moves under broadly symmetric distributions sit inside 1σ; an outcome beyond 1σ in the predicted direction is the strongest "the market moved on this thesis, not on noise" signal we can give without hypothesis testing. k is a single knob we can revisit later.

### D2. Compute N-day realized σ directly from overlapping returns
For period N and lookback L: take all overlapping returns `r_i = p[i+N]/p[i] - 1` over the L-day price series and compute the sample standard deviation. No √T daily-vol scaling. **Trade-off:** overlapping windows introduce autocorrelation that inflates the *variance of the estimator*, but the *point estimate* is still appropriate for use as a threshold; the alternative (non-overlapping) wastes data and gives ~5–8 samples for 365d, which is unusable.

### D3. Lookback windows
| Period | Lookback (calendar) | Approx trading days | Approx samples |
| --- | --- | --- | --- |
| 5d | 1 year | 252 | ~247 |
| 30d | 1 year | 252 | ~222 |
| 90d | 2 years | 504 | ~414 |
| 365d | 3 years | 756 | ~391 |

We pull from `stock_prices` by calendar range (since the table is keyed on calendar `date`) and let the actual trading-day count fall out naturally. Lookback length is converted to a calendar offset (e.g., 365d × 1 year, 365d × 2 years, 365d × 3 years) plus a small buffer.

### D4. Anchor date is `posted_at` and the lookback bound is strict `<`
The σ for a given post uses only price rows with `date < posted_at` (note: half-open). This guarantees no look-ahead: the threshold is what was knowable at the moment of the call.

### D5. IPO fallback uses a single same-market index, no industry layer
- `'TW'` → TWSE weighted index (`^TWII`, fetched via TWSE Open Data — same provider already wired for TW stocks).
- `'US'` and `'CRYPTO'` → S&P 500 (`SPY` via Tiingo).
- `'HK'` → typed error (`UnsupportedMarketError`) — surfaced as `'no_data'` upstream so the consumer doesn't crash.

The threshold result carries `{ value: number; source: 'ticker' | 'index-fallback' }` so the API and UI can show "fallback used".

### D6. New module boundary
Two pure modules + one service:

```ts
// volatility.calculator.ts
export type PeriodDays = 5 | 30 | 90 | 365;
export interface PriceSeriesPoint { date: string; close: number; } // YYYY-MM-DD
export interface VolatilityProvider {
  getSeries(ticker: string, opts: { from: string; to: string }): Promise<PriceSeriesPoint[]>;
  getMarket(ticker: string): Promise<'TW' | 'US' | 'CRYPTO' | 'HK'>;
}
export interface VolatilityResult {
  value: number;          // 1σ as a fractional return (e.g. 0.034 = 3.4%)
  source: 'ticker' | 'index-fallback';
  sampleSize: number;
  asOfDate: string;       // YYYY-MM-DD
  ticker: string;
  periodDays: PeriodDays;
}
export function calculateRealizedVolatility(prices: PriceSeriesPoint[], periodDays: PeriodDays): number;
export async function getVolatilityThreshold(args: {
  ticker: string;
  periodDays: PeriodDays;
  asOfDate: Date;
  provider: VolatilityProvider;
}): Promise<VolatilityResult>;
```

```ts
// win-rate.calculator.ts
export type WinRateOutcome = 'win' | 'lose' | 'noise' | 'excluded';
export function classifyOutcome(args: {
  sentiment: Sentiment;        // -3..+3
  priceChange: number | null;  // fractional, e.g. 0.024 = +2.4%; null → excluded
  threshold: number;           // fractional 1σ
}): WinRateOutcome;
```

```ts
// win-rate.service.ts (server-side; uses repos)
export async function computeWinRateStats(args: {
  posts: PostWithPriceChanges[];
  provider: VolatilityProvider;   // injected; default = StockPriceVolatilityProvider
}): Promise<WinRateStats>;
```

`WinRateStats` shape (additive next to existing `ReturnRateStats`):

```ts
export interface WinRateBucket {
  total: number;        // win + lose + noise (excluded not counted)
  winCount: number;
  loseCount: number;
  noiseCount: number;
  excludedCount: number;
  winRate: number | null;     // winCount / (winCount + loseCount); null if denom == 0
  threshold: { value: number; source: 'ticker' | 'index-fallback' } | null; // representative for the bucket
}
export interface WinRateStats {
  day5: WinRateBucket;
  day30: WinRateBucket;
  day90: WinRateBucket;
  day365: WinRateBucket;
}
```

**Note:** the per-bucket `threshold` is a *representative* (e.g., median across the bucket's posts), since each post has its own threshold. Detailed per-post thresholds are not surfaced through the API in v1; they live in debug logs only.

**Why a service layer between the calculator and the API route:** the route does the same dance as `/return-rate` (fetch posts → fetch candles per stock → compute), but now also needs to fetch a much longer historical window for σ. Putting that in a service keeps both routes thin and lets unit tests inject a fake `VolatilityProvider`.

### D7. `winRate` denominator excludes Noise
`winRate = winCount / (winCount + loseCount)`. Noise posts are excluded from both numerator and denominator, but we expose `noiseCount` so the UI can show "X noise" alongside the ratio. This matches the brief's intent: a Noise post is "we couldn't tell".

### D8. Caching strategy
- **σ cache:** in-memory LRU keyed by `(ticker, periodDays, asOfDate-YYYY-MM-DD)`, scoped per service instance (i.e., per request in serverless). Same-day asOfDate values within a batch dedupe. Bounded ~1000 entries. Stale-safe because historical σ for a fixed asOfDate is deterministic.
- **Price series cache:** existing `stock_prices` table is already authoritative; the service just calls `getStockPriceSeries(ticker, { from, to })` which extends `getStockPrices` to expose the underlying rows directly (avoiding the chart-shape transform).

### D9. Consumer migration approach
- `KolScorecard` and the stock detail page → switch from inline computation to React Query hooks (`useKolWinRate(id)` / `useStockWinRate(ticker)`).
- `PortfolioPulse` and `KolLeaderboard` currently take `posts: PostWithPriceChanges[]` from the parent server component. Since these need server-computed σ (we don't want to ship 3y of price data to the browser), they switch to receiving a server-computed aggregate prop (e.g., `winRateByKol: Record<KolId, WinRateBucket>`) calculated in the dashboard server component using the same service. This is a small server-side refactor of the dashboard page, not a wholesale rewrite.
- Where the inline code today reads `change > 0` as the win condition with no threshold, the new behavior necessarily diverges. Snapshot before/after for one or two KOLs as part of validation.

### D10. Sentiment mapping
The project's `Sentiment` is `-3..+3` integers (not `'Bullish' | 'Bearish' | 'Neutral'` as the brief implied). The classifier treats `sentiment > 0` as Bullish, `sentiment < 0` as Bearish, `sentiment === 0` as Excluded. The strength of the signal (1 vs 3) does not affect classification in v1; it can later inform aggregation/weighting in a follow-up change.

## Risks / Trade-offs

- **Visible UX shift.** Win rates will change for everyone the moment this ships. Mitigation: snapshot before/after for representative KOLs/stocks in the validation report; add the threshold annotation to the WinRateRing so the change has an explanation visible in the UI.
- **Long history fetches at request time.** 365d σ wants 3 years of history; first computation per (ticker, asOfDate) may hit Tiingo. Mitigation: leverage existing `stock_prices` cache (historical rows never expire); on cold starts, accept the Tiingo round-trip — long-history backfill is one-time per ticker.
- **Estimator inflation from overlapping returns.** Acknowledged in D2; we use σ as a threshold not an inferential statistic.
- **Index proxy mismatch for CRYPTO.** SPY is not a great proxy for BTC volatility, but it is at least *some* market. Better than throwing. The fallback only triggers when an individual crypto ticker has < lookback history; mainstream ones won't hit it.
- **Per-post threshold variation in the same bucket.** A KOL who posts about TSLA today and AAPL yesterday gets different thresholds for the same `day30` bucket. The bucket-level `threshold` we expose is therefore a *representative* (median), not a single shared value. UI must label it as such.
- **HK market is unsupported.** Throwing for HK is preferable to silently producing wrong numbers; the consumer should treat it as `noData`.

## Migration Plan

1. Land `volatility.calculator.ts` + `win-rate.calculator.ts` + tests first (no consumer wiring) — these are pure modules and risk-free.
2. Land `win-rate.service.ts` + the two API routes + the hook file. Routes are net-new, no existing consumers, so they cannot break anything.
3. Snapshot current rendered win rates for 5 representative KOLs (mix of mega cap, small cap, crypto, recent IPO) and 5 stocks.
4. Refactor `KolScorecard` + stock detail page to consume the new hooks. Sanity-check the rings render and the numbers match the new server values.
5. Refactor the dashboard server component to compute the aggregate once and pass it down to `PortfolioPulse` and `KolLeaderboard`. Remove their inline `useMemo` win-rate blocks.
6. Update `docs/INVARIANTS.md` W1 to reflect the implemented behavior.
7. Run `npm test`, `npm run type-check`, `npm run lint`, plus a manual spot-check using the snapshot in step 3. Document the diffs in the validation report.

**Rollback:** since the new API routes and hooks are net-new, rolling back is "revert the consumer-site refactors and leave the new modules dormant." No data migration to undo.

## Open Questions

- Should the bucket-level `threshold` be median or mean of per-post thresholds? Leaning median (robust to outliers from low-history tickers), but happy to use mean if the UI reads better.
- For `PortfolioPulse`, should `winRate` be one number aggregated across all periods, or should the widget switch to a single chosen period (day30) explicitly? Current code uses day30-with-day5-fallback. Leaning: keep day30 with explicit no-fallback (cleaner contract), and let the widget show a "—" if day30 has no data.
- Do we add a `?period=` query param to the new API routes to support a per-period view, or always return all four buckets? Leaning: always all four — the payload is tiny and consumers slice as needed.
