## Context

The stock price pipeline currently uses Tiingo for US equities and crypto. Tiingo does not support Taiwan (TWSE) or Hong Kong (HKEX) listed stocks. The domain model (`Market = 'US' | 'TW' | 'HK' | 'CRYPTO'`) and AI service already identify non-US tickers correctly, but price fetching silently returns empty data for TW/HK markets.

Twelve Data provides a REST API with daily OHLCV data for both TWSE and HKEX exchanges. The free tier offers 800 requests/day and 5,000/month — sufficient for once-per-day EOD updates.

## Goals / Non-Goals

**Goals:**
- Fetch daily OHLCV prices for TW and HK stocks via Twelve Data's `time_series` endpoint
- Route price requests by market: Tiingo for US/CRYPTO, Twelve Data for TW/HK
- Maintain the existing Supabase cache layer (no schema changes needed)
- Normalize Twelve Data responses to the same `TiingoPriceRow`-compatible format used downstream
- Add `TWELVE_DATA_API_KEY` to environment configuration

**Non-Goals:**
- Replacing Tiingo for US/CRYPTO (it works well, keep it)
- Real-time or intraday price data (EOD daily is sufficient)
- Adding new npm dependencies (Twelve Data is a simple REST API)
- Changing the `stock_prices` DB schema or cache strategy
- Supporting additional markets beyond TW/HK in this change

## Decisions

### 1. Separate client file, not extending tiingo.client.ts

Create `src/infrastructure/api/twelve-data.client.ts` alongside the existing `tiingo.client.ts`. The two APIs have different URL structures, auth mechanisms, and response formats — mixing them in one file would reduce clarity.

**Alternative considered:** Single `price.client.ts` with provider abstraction — rejected as over-engineering for two providers. A simple dispatch in the repository is sufficient.

### 2. Ticker format: strip suffix, pass exchange parameter

Our AI service identifies TW/HK tickers as `2330.TW` and `0700.HK`. Twelve Data expects the numeric symbol + an `exchange` query parameter:
- `2330.TW` → `symbol=2330&exchange=TWSE`
- `0700.HK` → `symbol=0700&exchange=HKEX`

The mapping logic lives in the Twelve Data client, keeping ticker format concerns isolated.

```
Stored ticker     Twelve Data API call
─────────────     ──────────────────────────────────
2330.TW      →    symbol=2330 & exchange=TWSE
0700.HK      →    symbol=0700 & exchange=HKEX
```

### 3. Market-based dispatch in stock-price.repository.ts

The repository already resolves `stock.market` before fetching prices. Add a simple switch:

```
getStockPrices(ticker)
  │
  ├─ market === 'CRYPTO'  → fetchTiingoPrices(ticker, { market: 'CRYPTO' })
  ├─ market === 'TW'      → fetchTwelveDataPrices(ticker, 'TW', ...)
  ├─ market === 'HK'      → fetchTwelveDataPrices(ticker, 'HK', ...)
  └─ default (US)         → fetchTiingoPrices(ticker, ...)
```

No abstract provider interface — just a conditional. The cache layer (`readCachedPrices`, `writePricesToCache`, `isCacheValid`) remains completely unchanged since it operates on `stock_id`, not ticker format.

### 4. Response normalization

Twelve Data returns:
```json
{
  "meta": { "symbol": "2330", "exchange": "TWSE", ... },
  "values": [
    { "datetime": "2026-03-17", "open": "595.00", "high": "600.00", "low": "590.00", "close": "598.00", "volume": "23456789" }
  ]
}
```

Note: values are **strings**, not numbers. The client will parse them to numbers and return the same `TiingoPriceRow` shape so the repository's `transformTiingoRows()` function works without modification.

### 5. Error handling: same pattern as Tiingo

- 404 / empty → return `[]` (triggers stale-cache fallback in repository)
- API error → throw (triggers stale-cache fallback in repository)
- No special retry logic (matches Tiingo behavior)

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  stock-price.repository.ts                │
│                                                          │
│  getStockPrices(ticker)                                  │
│    ├─ resolveStock(ticker) → { id, market }              │
│    ├─ readCachedPrices(stockId, ...) ← unchanged         │
│    │                                                     │
│    ├─ if market = US/CRYPTO                              │
│    │   └─ fetchTiingoPrices()  ← tiingo.client.ts        │
│    │                                                     │
│    ├─ if market = TW/HK                                  │
│    │   └─ fetchTwelveDataPrices() ← twelve-data.client.ts│
│    │                                                     │
│    └─ writePricesToCache(stockId, ...) ← unchanged       │
└──────────────────────────────────────────────────────────┘
```

## File Changes

| File | Change |
| --- | --- |
| `src/infrastructure/api/twelve-data.client.ts` | **New** — Twelve Data REST client |
| `src/infrastructure/api/tiingo.client.ts` | Export `TiingoPriceRow` type (already exported, no change needed) |
| `src/infrastructure/repositories/stock-price.repository.ts` | Add market-based dispatch to `getStockPrices()` |
| `.env.example` or equivalent docs | Add `TWELVE_DATA_API_KEY` |
| `CLAUDE.md` | Add `TWELVE_DATA_API_KEY` to Required Variables |
| `src/infrastructure/api/__tests__/twelve-data.client.test.ts` | **New** — Unit tests for Twelve Data client |
| `src/infrastructure/repositories/__tests__/stock-price.repository.test.ts` | Update tests for market dispatch |

## Risks / Trade-offs

- **[Risk] Twelve Data free tier rate limits (800/day)** → Mitigation: We only fetch EOD data once per day per stock. Even with 100+ stocks the daily quota is ample. The existing Supabase cache prevents redundant API calls.
- **[Risk] Twelve Data API response format changes** → Mitigation: Unit tests with mocked responses will catch format drift. The client has clear parsing with explicit type checks.
- **[Risk] TW/HK ticker format mismatch** → Mitigation: The client handles `2330.TW` → `symbol=2330&exchange=TWSE` mapping. If AI produces unexpected formats, the 404 fallback returns empty gracefully.
- **[Trade-off] Two separate price clients vs. unified abstraction** → Accepted: Simplicity over abstraction. Two clients with a conditional dispatch is easier to maintain than an interface + factory pattern for just two providers.
