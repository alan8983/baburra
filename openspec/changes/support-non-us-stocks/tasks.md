## 1. Twelve Data Client

- [x] 1.1 Create `src/infrastructure/api/twelve-data.client.ts` with `fetchTwelveDataPrices(ticker, market, options?)` function
  - Parse ticker: strip `.TW` / `.HK` suffix to get numeric symbol
  - Map market to exchange: `TW` → `TWSE`, `HK` → `HKEX`
  - Call `GET https://api.twelvedata.com/time_series` with params: `symbol`, `exchange`, `interval=1day`, `start_date`, `end_date`, `apikey`
  - Parse string values to numbers in response
  - Return `TiingoPriceRow[]` (reuse type from tiingo.client.ts)
  - Handle 404 / empty → return `[]`
  - Handle API errors → throw with descriptive message

- [x] 1.2 Create `src/infrastructure/api/__tests__/twelve-data.client.test.ts`
  - Test ticker parsing: `2330.TW` → symbol `2330`, exchange `TWSE`
  - Test ticker parsing: `0700.HK` → symbol `0700`, exchange `HKEX`
  - Test response normalization: string values → numbers
  - Test empty / 404 response handling
  - Test API error handling

## 2. Market-Based Price Dispatch

- [x] 2.1 Update `src/infrastructure/repositories/stock-price.repository.ts` to dispatch by market
  - Import `fetchTwelveDataPrices` from twelve-data client
  - In `getStockPrices()`, after resolving stock, route:
    - `market === 'TW'` or `market === 'HK'` → `fetchTwelveDataPrices()`
    - `market === 'CRYPTO'` → `fetchTiingoPrices()` (unchanged)
    - Default (US) → `fetchTiingoPrices()` (unchanged)
  - Existing cache logic (`readCachedPrices`, `writePricesToCache`, `isCacheValid`) remains unchanged

- [x] 2.2 Update `src/infrastructure/repositories/__tests__/stock-price.repository.test.ts`
  - Add test case: TW market stock routes to Twelve Data
  - Add test case: HK market stock routes to Twelve Data
  - Verify US/CRYPTO still routes to Tiingo

## 3. Environment & Documentation

- [x] 3.1 Add `TWELVE_DATA_API_KEY` to environment config
  - Add to `.env.example` (if it exists) or document in CLAUDE.md Required Variables section
  - Add `getApiKey()` helper in twelve-data client that reads `TWELVE_DATA_API_KEY` env var

- [x] 3.2 Update `CLAUDE.md` Required Variables section to include `TWELVE_DATA_API_KEY`

- [x] 3.3 Update `openspec/specs/data-models.md` to note that `stock_prices` table now sources from both Tiingo (US/CRYPTO) and Twelve Data (TW/HK)

## 4. Verification

- [x] 4.1 Run unit tests: `npx vitest run src/infrastructure/api/__tests__/twelve-data.client.test.ts`
- [x] 4.2 Run existing stock-price repository tests to confirm no regressions
- [x] 4.3 Run `npm run type-check` to verify TypeScript compilation
- [x] 4.4 Run `npm run lint` to verify code style
