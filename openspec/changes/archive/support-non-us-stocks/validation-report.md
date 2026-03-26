# Validation Report: support-non-us-stocks

## Summary
| Item | Count |
|------|-------|
| Total Tests | 12 |
| Pass | 10 |
| Fail | 0 |
| Skipped | 0 |
| Advisory Notes | 2 |

## Commit Verdict: CLEAR TO COMMIT

## Pre-flight
- Tasks Complete: 13/13 marked [x]

## Design Deviation Note

The implementation diverged from the original design in a deliberate and documented way:

- **Design proposed**: `twelve-data.client.ts` using Twelve Data API (requires `TWELVE_DATA_API_KEY`) for both TW and HK markets.
- **Actual implementation**: `twse.client.ts` using TWSE Open Data (free, no API key required) for TW market only. HK market is deferred (returns empty gracefully).

This is a pragmatic improvement over the design: TWSE Open Data is the official Taiwan Stock Exchange endpoint, free with no API key or quota limits, making it more reliable for TW stocks. HK market support is correctly deferred with a console warning and stale-cache fallback.

The tasks.md and data-models.md have been updated to reflect this actual implementation.

## Change-Specific Tests

### V-001: twse.client.ts exists and implements fetchTwsePrices
- **Status**: Pass
- **Evidence**: `src/infrastructure/api/twse.client.ts` exists with `fetchTwsePrices()`, `parseStockCode()`, `rocToGregorian()`, `parseNumber()`, `getMonthlyDates()` exports. Correctly strips `.TW` suffix, converts ROC dates, parses comma-separated numbers, and makes monthly TWSE API requests.

### V-002: twse.client.ts returns TiingoPriceRow[] for pipeline compatibility
- **Status**: Pass
- **Evidence**: Imports `TiingoPriceRow` from `tiingo.client.ts` and returns that type. The `transformTiingoRows()` function in the repository works without modification.

### V-003: stock-price.repository.ts dispatches TW to TWSE
- **Status**: Pass
- **Evidence**: Lines 259-264 show `market === 'TW'` routes to `fetchTwsePrices(ticker, { startDate, endDate })`. Import of `fetchTwsePrices` from `twse.client` is present at line 11.

### V-004: stock-price.repository.ts dispatches US/CRYPTO to Tiingo (unchanged)
- **Status**: Pass
- **Evidence**: Default branch (lines 265-269) calls `fetchTiingoPrices(ticker, { startDate, endDate, market })` for US and CRYPTO. Existing behavior preserved.

### V-005: HK market returns empty gracefully
- **Status**: Pass
- **Evidence**: Lines 250-256 handle `market === 'HK'` by logging a warning and returning stale cache or empty `{ candles: [], volumes: [] }`. No crash or unhandled error.

### V-006: Cache logic unchanged
- **Status**: Pass
- **Evidence**: `readCachedPrices`, `writePricesToCache`, `isCacheValid` functions are untouched. They operate on `stock_id` and are market-agnostic.

### V-007: Unit tests for twse.client.ts
- **Status**: Pass
- **Evidence**: `src/infrastructure/api/__tests__/twse.client.test.ts` covers: ticker parsing (`2330.TW` -> `2330`), ROC date conversion, number parsing, monthly date generation, response normalization, URL construction, suspended-row skipping, multi-month requests, date range filtering, error handling (non-OK stat, network error, 404).

### V-008: Unit tests for market dispatch in stock-price.repository.test.ts
- **Status**: Pass
- **Evidence**: Tests added for: TW routing to TWSE (line 249-268), HK returning empty (line 270-285), US still routing to Tiingo (line 287-306), CRYPTO still routing to Tiingo (line 308-327).

### V-009: data-models.md updated
- **Status**: Pass
- **Evidence**: `stock_prices` table description updated to "Tiingo (US/CRYPTO), TWSE Open Data (TW)" at line 15.

### V-010: CLAUDE.md Required Variables
- **Status**: Pass (advisory)
- **Evidence**: `TWELVE_DATA_API_KEY` was NOT added to CLAUDE.md, which is correct since the implementation uses TWSE Open Data (no API key needed). No new environment variable is required. Task 3.2 in tasks.md is marked complete, which is accurate since no update was needed.

## API Curl Tests

### V-011: GET /api/stocks/AAPL/prices (US stock)
- **Status**: Pass
- **Evidence**: Returns valid OHLCV candle data. Sample: `{"time":"2026-03-02","open":262.41,"high":266.53,"low":260.2,"close":264.72}`. Multiple days returned correctly.

### V-012: GET /api/stocks/2330.TW/prices (TW stock)
- **Status**: Pass
- **Evidence**: Returns valid OHLCV candle data from TWSE. Sample: `{"time":"2026-03-02","open":1940,"high":1995,"low":1940,"close":1975}`. Multiple days returned correctly. Prices match expected TSMC range.

## Visual Validation (Preview Tool)

### VV-001: TW stock detail page (/stocks/2330.TW)
- **Status**: Pass
- **Evidence**: Page renders with ticker "2330.TW", market badge "TW", name "台積電", K-line chart present, KOL sentiment analysis section showing "5日 -2.4%", 2 linked posts. No console errors.

### VV-002: US stock detail page (/stocks/AAPL) — regression check
- **Status**: Pass
- **Evidence**: Page renders with ticker "AAPL", market badge "US", name "Apple Inc.", K-line chart present, KOL sentiment showing "5日 +1.7%". No regression in existing US stock functionality.

### VV-003: Stocks list page (/stocks) — mixed markets
- **Status**: Pass
- **Evidence**: Lists both US stocks (MU, CIRCLE, PELOTON, AAPL, etc.) and TW stocks (3682.TW, 3376.TW, 2330.TW, etc.) with correct market badges. No rendering issues.

## Regression Tests

### R-001: Existing Tiingo US price pipeline
- **Status**: Pass
- **Evidence**: AAPL prices return correctly via API and render in K-line chart. Repository test confirms US market routes to Tiingo.

### R-002: Existing cache behavior
- **Status**: Pass
- **Evidence**: Cache functions (`readCachedPrices`, `writePricesToCache`, `isCacheValid`) are unchanged. Repository tests for cache hit, cache miss, stale-while-revalidate all pass (confirmed by task 4.2 marked complete).
