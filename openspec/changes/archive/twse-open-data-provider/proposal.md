## Why

The previous approach used Twelve Data for TW stock prices, but its free tier (800 req/day) does **not** include TWSE or HKEX symbols — those require a Pro/Venture plan ($30–$100/month). Since Baburra.io targets retail investors tracking TW-listed KOLs, paying for a third-party API when TWSE offers free official Open Data makes no sense.

TWSE Open Data (`openapi.twse.com.tw`) provides daily OHLCV for all listed stocks with **no API key, no rate limits, and no cost**. Two endpoints cover our needs:

1. **`/v1/exchangeReport/STOCK_DAY_ALL`** — Today's OHLCV for all ~1,800 listed stocks (single request)
2. **`/exchangeReport/STOCK_DAY?stockNo=<code>&date=<YYYYMMDD>`** — A full month of daily OHLCV for a specific stock (historical)

This change replaces the Twelve Data client with a TWSE Open Data client for TW market stocks. HK market support is deferred (needs a separate data source).

## What Changes

- Replace `src/infrastructure/api/twelve-data.client.ts` with `src/infrastructure/api/twse.client.ts` — TWSE Open Data client for TW market
- Update `stock-price.repository.ts` to dispatch TW → TWSE client (instead of Twelve Data)
- Remove `TWELVE_DATA_API_KEY` from environment config and CLAUDE.md
- HK market: keep the dispatch path but return `[]` gracefully (deferred to future change)
- Update tests accordingly

## Capabilities

### New Capabilities
- `twse-open-data-integration`: TWSE Open Data client fetching daily OHLCV for Taiwan-listed stocks via free government API

### Removed Capabilities
- `twelve-data-integration`: Removed due to cost — free tier doesn't cover TWSE/HKEX

### Modified Capabilities
- `stock-price-pipeline`: TW market routes to TWSE Open Data instead of Twelve Data; HK market returns empty gracefully (deferred)

## Impact

- **Environment**: `TWELVE_DATA_API_KEY` removed from CLAUDE.md Required Variables. No new env vars needed (TWSE Open Data is keyless).
- **Dependencies**: No new npm packages — TWSE uses simple REST + JSON
- **API quota**: Unlimited — TWSE Open Data has no published rate limits
- **Existing behavior**: US and CRYPTO price fetching remains unchanged (Tiingo)
- **Database**: No schema changes
- **HK market**: Will return empty data (same as before Twelve Data). Deferred to a future change with an appropriate free/affordable HK data source.
