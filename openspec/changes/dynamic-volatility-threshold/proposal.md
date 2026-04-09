## Why

The app shows a "win rate" everywhere (KOL scorecard ring, dashboard pulse, KOL leaderboard, stock detail page) but no central definition exists. Each consumer recomputes it inline with the same shortcut: a non-neutral post is a "win" if `priceChange > 0` for bullish or `priceChange < 0` for bearish — implicit threshold zero, no Noise band, day30 only. This produces three problems:

1. **Noise is rewarded.** TSLA jiggling ±0.5% over 5 days counts as a Win or Loss with equal weight as a 30% conviction call.
2. **Long-horizon noise is hidden.** A 365-day +2.1% gain is a "Win" even though it underperforms a savings account.
3. **Logic drift.** Four+ consumer sites compute "win rate" slightly differently; there is no single source of truth, no tests, no documented invariant in code.

The `INVARIANTS.md` W1 sketch (`WIN_RATE_THRESHOLD = 0.02`) was never implemented. We're going to implement it for real, but with a *dynamic* per-ticker per-period 1σ threshold instead of a fixed 2%, and centralize the classifier so every consumer computes win rate the same way.

## What Changes

- Add a new pure module `volatility.calculator.ts` that computes realized N-day return σ for a ticker as of a given date, with no √T scaling, lookback windows scaling with the period (5d/30d→252d, 90d→504d, 365d→756d), strict no-look-ahead, IPO fallback to same-market index (TWSE weighted index for TW, S&P 500 for US/CRYPTO), and an in-memory LRU cache keyed by `(ticker, periodDays, asOfDate-YYYY-MM-DD)`.
- Add a new pure module `win-rate.calculator.ts` that classifies a single (post, stock, period) tuple into `Win | Noise | Lose | Excluded` against a *dynamic* threshold supplied by an injected `ThresholdProvider`. The classifier preserves the existing semantics around `Sentiment` (the project's `-3..+3` scale, where `0` is Neutral and excluded), and adds Noise as a new outcome.
- Add a server-side `WinRateService` that, given a set of posts + price-change data + a stock-price provider, fetches/caches the per-(ticker, period, postedAt) σ, runs the classifier, and aggregates `WinRateStats` (per-period: win/lose/noise/excluded counts, win rate, threshold value, threshold source).
- Add new API routes `GET /api/kols/[id]/win-rate` and `GET /api/stocks/[ticker]/win-rate` returning `WinRateStats`. (These do *not* replace `/return-rate` — average return is a separate metric kept as-is.)
- Add React Query hooks `useKolWinRate(id)` and `useStockWinRate(ticker)` and refactor the four current inline win-rate sites (`kol-scorecard.tsx`, `portfolio-pulse.tsx`, `kol-leaderboard.tsx`, and the stock detail page) to consume them. The dashboard `PortfolioPulse` and `KolLeaderboard` cases that currently take a flat `posts` prop will switch to a server-computed aggregate so the math is identical everywhere.
- Extend `getStockPrices` callers to fetch up to 3 years of history when computing 365d-period σ, or add a new repository helper `getStockPriceSeries(ticker, { from, to })` if simpler.
- Update `docs/INVARIANTS.md` W1 to describe the dynamic 1σ rule, the no-look-ahead anchor, and the IPO/index fallback. Mark the previous fixed-2% description as superseded.
- **BREAKING (visible UX)**: Win rates rendered today will change for every KOL/stock once the new classifier ships, because (a) Noise posts are excluded from the denominator and (b) the threshold is no longer zero. Add a one-line UI affordance ("threshold: ±X% σ") next to the ring so the change is explainable.

## Capabilities

### New Capabilities
- `win-rate-classification`: The end-to-end definition of how a Post is classified into Win/Noise/Lose against a dynamic per-ticker per-period 1σ threshold, including the volatility calculation, the IPO index fallback, the aggregation rules behind `WinRateStats`, and the contract for consumers (API routes + hooks).

### Modified Capabilities
<!-- None — there is no existing spec covering win-rate behavior. -->

## Impact

- **Code added**:
  - `src/domain/calculators/volatility.calculator.ts` + tests
  - `src/domain/calculators/win-rate.calculator.ts` + tests
  - `src/domain/services/win-rate.service.ts` + tests
  - `src/app/api/kols/[id]/win-rate/route.ts`
  - `src/app/api/stocks/[ticker]/win-rate/route.ts`
  - `src/hooks/use-win-rate.ts` (or extending an existing hook file)
  - Possibly `src/infrastructure/api/index-prices.ts` (thin loader for `^TWII` via TWSE and `SPY` via Tiingo, if not already covered by `getStockPrices`)
- **Code modified**:
  - `src/app/(app)/kols/[id]/_components/kol-scorecard.tsx` — replace inline `winCount/totalCalls` block with hook
  - `src/app/(app)/dashboard/_components/portfolio-pulse.tsx` — replace inline `winRate` math with server-computed aggregate (server prop or hook)
  - `src/app/(app)/dashboard/_components/kol-leaderboard.tsx` — same
  - `src/app/(app)/stocks/[ticker]/page.tsx` — wire to `useStockWinRate`
  - `src/infrastructure/repositories/stock-price.repository.ts` — confirm or extend to support 3y range fetches
  - `docs/INVARIANTS.md` — W1 rewritten
- **Data**: depends on `stock_prices` having ≥3 years of history for tickers used in 365d σ. Verify per representative ticker; backfill via Tiingo on demand. Confirm or add DB index on `stock_prices(stock_id, date)` (likely already present given the `(stock_id, date)` upsert key).
- **Unchanged**: `/return-rate` API routes and the `return-rate.calculator.ts` module — average return remains a distinct metric. AI pipeline. Sentiment scale (`-3..+3`).
- **Out of scope**: KOL overall win-rate aggregation rules across periods (min sample size, period weighting, signal strength) — separate change. k-value tuning via backtest (hardcoded k=1 in v1). HK market support. Newey-West / GARCH adjustments.
