## 1. Calculator Layer

- [x] 1.1 Extend `ClassifiedSample` in `src/domain/calculators/win-rate.calculator.ts` to carry `excessReturn: number | null`, computed as `sign * priceChange / threshold.value` (sign from sentiment direction)
- [x] 1.2 Update `classifyOutcome` / its wrapper to populate `excessReturn` for non-excluded samples
- [x] 1.3 Add pure helpers in `src/domain/calculators/win-rate.calculator.ts` (or a new `performance-metrics.calculator.ts`): `computeHitRate`, `computePrecision`, `computeAvgExcess(samples, outcome)`, `computeSqr(samples)` with Bessel-corrected stdev
- [x] 1.4 Export a single `MIN_RESOLVED_POSTS_PER_PERIOD = 10` constant from the calculators barrel
- [x] 1.5 Unit tests in `win-rate.calculator.test.ts` (and new `performance-metrics.calculator.test.ts`) covering: excess-return sign for bullish/bearish win/lose, hit-rate with noise in denom, precision vs. hit-rate divergence, SQR under normal/degenerate/empty inputs, floor boundary at 9 and 10

## 2. Service Layer

- [x] 2.1 Update `src/domain/services/win-rate.service.ts` to build a `PeriodMetrics` object per period from the classified samples, using the new calculators
- [x] 2.2 Apply the `sufficientData` floor: when `wins + loses < 10`, null-out `hitRate`, `precision`, `avgExcessWin`, `avgExcessLose`, `sqr`
- [x] 2.3 Preserve the `winRate` alias (= `precision`) on the bucket with `@deprecated` TSDoc
- [x] 2.4 Extend `win-rate.service.test.ts` covering: per-period independence (5d sufficient, 365d not), noise-dominated KOL, SQR numeric correctness against a hand-computed fixture, alias equals precision

## 3. API Routes

- [x] 3.1 Update `src/app/api/kols/[id]/win-rate/route.ts` to return the new `PeriodMetrics` shape across all four periods
- [x] 3.2 Update `src/app/api/stocks/[ticker]/win-rate/route.ts` symmetrically
- [x] 3.3 Smoke-test both routes manually (or via existing integration tests) with a seeded fixture to confirm payload shape

## 4. Hooks + Consumers

- [x] 4.1 Update the `useKolWinRate` / `useStockWinRate` hook signatures (locate the file via `grep -r "winRate" src/hooks`) to expose the new fields and types
- [x] 4.2 Regenerate / update any shared type aliases in `src/domain/models/` so `PeriodMetrics` is importable
- [x] 4.3 Verify existing ring consumers (`kol-scorecard.tsx`, `portfolio-pulse.tsx`, `kol-leaderboard.tsx`, stock detail page) still render via the `winRate` alias — no UI changes required in this change
- [x] 4.4 Add a follow-up BACKLOG item for the pie-chart / Hit-Rate UI migration (tracked outside this change)

## 5. Docs + Validation

- [x] 5.1 Update `docs/INVARIANTS.md` W1 with Hit Rate, Precision, SQR, min-sample floor definitions
- [x] 5.2 Add a short dev note in `docs/ANALYSIS_FRAMEWORK.md` (or equivalent) explaining the Information-Ratio framing for SQR
- [x] 5.3 `npm run type-check && npm run lint && npm test` all green
- [x] 5.4 Validate via `/opsx:validate` (or manual QA against a seeded KOL) that the four API responses match the new shape
- [x] 5.5 Ready for archive: run `/opsx:archive kol-overall-performance-metrics` once merged
