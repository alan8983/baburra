# Validation Report: twse-open-data-provider

## Summary
| Item | Count |
|------|-------|
| Total Tests | 12 |
| Pass | 11 |
| Fail | 0 |
| Skipped | 1 |
| Critical Failures | 0 |

## Commit Verdict: CLEAR TO COMMIT

## Pre-flight
- Tasks Complete: 13/13 marked [x]

## Change-Specific Tests

### V-001: TWSE client exists with correct exports
- **Status**: Pass
- **Evidence**: `src/infrastructure/api/twse.client.ts` exports `parseStockCode`, `rocToGregorian`, `parseNumber`, `getMonthlyDates`, `fetchTwsePrices`. All utility functions are pure and well-documented.

### V-002: Ticker parsing strips .TW suffix
- **Status**: Pass
- **Evidence**: `parseStockCode('2330.TW')` returns `'2330'`; handles bare codes and uses `lastIndexOf('.')` safely.

### V-003: ROC date conversion
- **Status**: Pass
- **Evidence**: `rocToGregorian('115/03/18')` returns `'2026-03-18'`. Graceful passthrough for invalid formats.

### V-004: Comma-separated number parsing
- **Status**: Pass
- **Evidence**: `parseNumber('1,940.00')` returns `1940`. Uses `replace(/,/g, '')` before `parseFloat`.

### V-005: Suspended trading rows skipped
- **Status**: Pass
- **Evidence**: Rows with `'--'` in open (index 3) or close (index 6) are skipped via explicit check at line 137.

### V-006: Multi-month fetch for date ranges
- **Status**: Pass
- **Evidence**: `getMonthlyDates` generates one YYYYMMDD per month. `fetchTwsePrices` iterates with 300ms delay between requests. Test confirms 3 requests for 3-month range.

### V-007: Repository dispatch routes TW to TWSE
- **Status**: Pass
- **Evidence**: `stock-price.repository.ts` line 260-264: `market === 'TW'` dispatches to `fetchTwsePrices(ticker, { startDate, endDate })`. No `market` param passed (TWSE doesn't need it). Test `'should route TW market stock to TWSE Open Data'` confirms.

### V-008: Repository dispatch returns empty for HK market
- **Status**: Pass
- **Evidence**: `stock-price.repository.ts` lines 250-256: `market === 'HK'` logs warning and returns `{ candles: [], volumes: [] }` (or stale cache if available). Neither `fetchTwsePrices` nor `fetchTiingoPrices` called. Test confirms.

### V-009: US/CRYPTO still routes to Tiingo
- **Status**: Pass
- **Evidence**: Repository tests `'should still route US market to Tiingo'` and `'should still route CRYPTO market to Tiingo'` both pass. Tiingo import unchanged.

### V-010: Twelve Data fully removed
- **Status**: Pass
- **Evidence**: No `twelve-data.client.ts` or `twelve-data.client.test.ts` files exist. `grep` for `twelve.data|twelveData|TWELVE_DATA` in `src/` returns zero matches. Only references remain in `openspec/` historical docs (expected).

### V-011: CLAUDE.md cleaned of TWELVE_DATA_API_KEY
- **Status**: Pass
- **Evidence**: `grep` for `TWELVE_DATA` in `CLAUDE.md` returns no matches.

### V-012: data-models.md updated
- **Status**: Pass
- **Evidence**: `openspec/specs/data-models.md` line 15: `stock_prices` table description reads "Tiingo (US/CRYPTO), TWSE Open Data (TW)".

## API Curl Tests

### API-001: GET /api/stocks/2330.TW/prices (TWSE integration)
- **Status**: Pass
- **Evidence**: HTTP 200. Returned 19 candles + 19 volumes for 2026-03-01 to 2026-03-27. First candle: `{"time":"2026-03-02","open":1940,"high":1995,"low":1940,"close":1975}`. All OHLCV fields are numeric, dates are ISO format, volumes include color coding. Real TWSE data confirmed.

### API-002: GET /api/stocks/AAPL/prices (Tiingo regression)
- **Status**: Pass
- **Evidence**: HTTP 200. Returned 4 candles for 2026-03-20 to 2026-03-27. Tiingo integration unaffected.

## Visual Validation (Preview Tool)

### VV-001: Stock detail page for 2330.TW renders correctly
- **Status**: Pass (via snapshot; screenshot timed out due to canvas rendering)
- **Evidence**: Accessibility snapshot confirms:
  - Ticker "2330.TW" and name "台積電" displayed
  - Market badge "TW" shown
  - KOL sentiment chart section rendered with canvas children
  - K-line chart section rendered with chart toolbar and data table
  - 5-day price change "-2.4%" calculated and displayed
  - "1正 / 1負 / 0待定" sentiment summary shown
  - 2 related posts listed
  - No console errors logged

### VV-002: Screenshot capture
- **Status**: Skipped
- **Evidence**: Preview screenshot tool timed out (30s) on the chart-heavy page. This is a tooling limitation with canvas-based chart rendering, not a product issue. The accessibility snapshot in VV-001 confirms the page structure is correct.

## Regression Tests

No regressions detected:
- US stock price API (Tiingo) returns correct data
- Stock detail page renders normally for TW stocks
- No broken imports or TypeScript references to removed Twelve Data module
- Repository cache logic (stale-while-revalidate) unchanged and tested
