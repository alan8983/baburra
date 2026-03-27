## Why

The app's domain model and AI service already support four markets (US, TW, HK, CRYPTO), but the price data pipeline only handles US equities and crypto via Tiingo. When the AI identifies a Taiwan stock like `2330.TW` (TSMC) or a Hong Kong stock like `0700.HK` (Tencent), the ticker is stored correctly but price fetching silently fails — returning empty data and breaking K-line charts, return rate calculations, and win rate tracking for non-US stocks.

Since stock prices only need to update once per day (end-of-day data), Twelve Data's free tier (800 req/day) is more than sufficient. This change introduces Twelve Data as a price provider for TW and HK markets while keeping Tiingo for US equities and crypto.

## What Changes

- Add Twelve Data as a new price data provider (`twelve-data.client.ts`) for TW and HK markets
- Refactor `stock-price.repository.ts` to dispatch price fetches by market: Tiingo for US/CRYPTO, Twelve Data for TW/HK
- Add `TWELVE_DATA_API_KEY` to environment configuration
- Update existing tests and add new tests for the Twelve Data client and market-based dispatch

## Capabilities

### New Capabilities
- `twelve-data-integration`: Twelve Data API client for fetching daily OHLCV prices for Taiwan (TWSE) and Hong Kong (HKEX) listed stocks

### Modified Capabilities
- `stock-price-pipeline`: Market-aware price provider dispatch — routes TW/HK to Twelve Data, keeps US/CRYPTO on Tiingo

## Impact

- **Environment**: `.env.example` gains `TWELVE_DATA_API_KEY`; `.env.local` needs it filled in
- **Dependencies**: No new npm packages — Twelve Data uses a simple REST API (native `fetch`)
- **API quota**: Twelve Data free tier provides 800 requests/day, 5,000/month. At once-per-day updates this is well within limits even for hundreds of stocks
- **Existing behavior**: US and CRYPTO price fetching remains unchanged (Tiingo)
- **Database**: No schema changes — `stock_prices` table already supports all markets via `stock_id` FK
