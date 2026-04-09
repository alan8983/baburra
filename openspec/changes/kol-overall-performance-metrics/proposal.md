## Why

The `dynamic-volatility-threshold` change gave us a correct Win/Noise/Lose classifier per period, but the UI still collapses each period into a single "win rate" number and hides everything else. That's insufficient for three reasons the product team raised:

1. **Single number hides magnitude.** A KOL who wins 6/10 times by 1σ is visually indistinguishable from one who wins 6/10 times by 3σ.
2. **Noise is invisible.** `winRate = wins / (wins + loses)` throws away the Noise bucket; a KOL whose every call is noise looks like "not enough data" instead of the actual signal: *this person doesn't move markets*.
3. **No stability indicator.** Users can't tell whether a KOL's 60% hit rate is steady or wildly streaky.
4. **No minimum-sample floor.** With 2 resolved posts we happily render "50%", which is worse than showing nothing.

We need a richer `PeriodMetrics` shape and the server-side math to populate it, built on top of the already-landed dynamic σ classifier.

## What Changes

- Extend the `WinRateBucket` / `WinRateStats` shape returned by `computeWinRateStats` into a new `PeriodMetrics` shape containing, per period: `wins`, `noise`, `loses`, `total`, `hitRate`, `precision`, `avgExcessWin`, `avgExcessLose`, `sqr`, and `sufficientData`. Existing fields stay (or are renamed consistently) so downstream consumers can migrate in one pass.
- Introduce two new metrics:
  - **Hit Rate** = `wins / (wins + noise + loses)` — the primary UI number. Noise is in the denominator.
  - **Precision** = `wins / (wins + loses)` — the classical win-rate, kept as a secondary number.
- Introduce **σ-normalized excess returns** computed in the service layer (not the classifier): for each classified sample, record `return / σ` (bullish) or `-return / σ` (bearish), then aggregate `avgExcessWin` (mean over Win samples) and `avgExcessLose` (mean over Lose samples).
- Introduce **Signal Quality Ratio (SQR)** = `mean(all σ-normalized returns) / stdev(all σ-normalized returns)` including Noise samples (their contribution is near zero, which correctly penalizes noisy KOLs). SQR is the Information-Ratio analog for discrete post events.
- Enforce a **minimum-sample floor** of `(wins + loses) ≥ 10` per period. Below the floor, `hitRate`, `precision`, `avgExcessWin`, `avgExcessLose`, and `sqr` are `null` and `sufficientData=false`; the Win/Noise/Lose counts are still returned.
- **Per-period independence**: every period computes its own `sufficientData` — a KOL with 25 resolved 5d posts but 3 resolved 365d posts shows full metrics for 5d and "insufficient data" for 365d. No cross-period averaging, no single "overall score".
- Update `GET /api/kols/[id]/win-rate` and `GET /api/stocks/[ticker]/win-rate` response shapes to return `PeriodMetrics` per period (day5/day30/day90/day365). Keep the route paths; bump the internal response shape only.
- Update `useKolWinRate` / `useStockWinRate` (or introduce adjacent hooks) to expose the new fields. Existing consumers (`kol-scorecard`, `portfolio-pulse`, `kol-leaderboard`, stock detail) must continue to render *something* meaningful during the rollout — we ship the data layer with backwards-compatible field names where possible, and file follow-up UI work separately.

## Capabilities

### Modified Capabilities
- `win-rate-classification`: The existing capability already covers Win/Noise/Lose classification and the 1σ threshold. This change extends it with the `PeriodMetrics` shape, Hit Rate, Precision, Avg Excess Win/Lose, SQR, and the minimum-sample floor — these are new requirements *on top of* the classifier contract, not a replacement.

## Impact

- **Code modified**:
  - `src/domain/calculators/win-rate.calculator.ts` — extend `WinRateBucket` / `aggregateBucket` to expose the raw per-sample σ-normalized returns needed downstream
  - `src/domain/services/win-rate.service.ts` — compute excess-return stats and SQR; apply min-sample floor
  - `src/app/api/kols/[id]/win-rate/route.ts` — new response shape
  - `src/app/api/stocks/[ticker]/win-rate/route.ts` — new response shape
  - `src/hooks/use-win-rate.ts` (or `use-kols.ts` / `use-stocks.ts` depending on where it lives today) — new typed return
  - Existing consumers of the old shape (`kol-scorecard.tsx`, `portfolio-pulse.tsx`, `kol-leaderboard.tsx`, stock detail page) — minimal field renames to pick up `hitRate` and `sufficientData`
- **Code added**:
  - `src/domain/calculators/performance-metrics.calculator.ts` (or inline into `win-rate.calculator.ts`) — pure helpers for Hit Rate, Precision, σ-normalized returns, SQR
  - Tests: extend `win-rate.calculator.test.ts`, add `performance-metrics.calculator.test.ts`, extend `win-rate.service.test.ts` with SQR + min-sample scenarios
- **Dependencies**: Builds on `dynamic-volatility-threshold` (already landed). No new runtime deps.
- **Docs**: Update `docs/INVARIANTS.md` (W1 → add Hit Rate, Precision, SQR definitions); update `openspec/specs/win-rate-classification/spec.md` with the new requirements.
- **Not in scope**: Alpha / Jensen's alpha (needs β regression + market index pipeline), Max Drawdown / Worst Streak (portfolio-level metrics, don't map to discrete posts), cross-KOL ranking algorithm, UI pie-chart component, min-sample threshold tuning — all out of scope for this change.
