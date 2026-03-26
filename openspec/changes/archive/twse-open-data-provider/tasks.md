## 1. TWSE Open Data Client

- [x] 1.1 Create `src/infrastructure/api/twse.client.ts` with `fetchTwsePrices(ticker, options?)` function
  - Parse ticker: strip `.TW` suffix to get stock code (e.g., `2330.TW` → `2330`)
  - Convert requested date range to monthly TWSE requests: `GET https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=YYYYMMDD&stockNo=<code>`
  - For each month in the requested range, fetch and merge results
  - Parse ROC dates to Gregorian: `115/03/18` → `2026-03-18`
  - Parse comma-separated number strings: `"1,940.00"` → `1940.00`
  - Skip rows with `"--"` prices (suspended trading days)
  - Return `TiingoPriceRow[]` (reuse type from tiingo.client.ts)
  - Filter results to only include dates within the requested start/end range
  - Handle `stat !== "OK"` → return `[]`
  - Handle network errors → throw with descriptive message

- [x] 1.2 Create `src/infrastructure/api/__tests__/twse.client.test.ts`
  - Test ticker parsing: `2330.TW` → stock code `2330`
  - Test ROC date conversion: `115/03/18` → `2026-03-18`
  - Test number parsing: `"1,940.00"` → `1940`, `"57,404,594"` → `57404594`
  - Test skip rows with `"--"` prices
  - Test multi-month fetch: 90-day range produces ~3 monthly requests
  - Test date filtering: only rows within requested range are returned
  - Test `stat !== "OK"` response handling
  - Test network error handling

## 2. Replace Twelve Data with TWSE in Repository

- [x] 2.1 Update `src/infrastructure/repositories/stock-price.repository.ts`
  - Replace `import { fetchTwelveDataPrices }` with `import { fetchTwsePrices }` from twse.client
  - Update dispatch: `market === 'TW'` → `fetchTwsePrices(ticker, { startDate, endDate })`
  - Update dispatch: `market === 'HK'` → log warning, return `{ candles: [], volumes: [] }` (deferred)
  - US/CRYPTO dispatch remains unchanged (Tiingo)

- [x] 2.2 Update `src/infrastructure/repositories/__tests__/stock-price.repository.test.ts`
  - Replace Twelve Data mock with TWSE mock
  - Update TW test case to verify routing to `fetchTwsePrices`
  - Update HK test case to verify graceful empty return (no API call)
  - Verify US/CRYPTO still routes to Tiingo

## 3. Cleanup Twelve Data

- [x] 3.1 Delete `src/infrastructure/api/twelve-data.client.ts`
- [x] 3.2 Delete `src/infrastructure/api/__tests__/twelve-data.client.test.ts`
- [x] 3.3 Remove `TWELVE_DATA_API_KEY` from `CLAUDE.md` Required Variables section
- [x] 3.4 Update `openspec/specs/data-models.md` to note TWSE Open Data instead of Twelve Data for TW market

## 4. Verification

- [x] 4.1 Run unit tests: `npx vitest run src/infrastructure/api/__tests__/twse.client.test.ts`
- [x] 4.2 Run repository tests: `npx vitest run src/infrastructure/repositories/__tests__/stock-price.repository.test.ts`
- [x] 4.3 Run `npm run type-check` to verify TypeScript compilation
- [x] 4.4 Run `npm run lint` to verify code style
- [x] 4.5 Manual verification: start dev server, call `/api/stocks/2330.TW/prices` and verify real OHLCV data returns
