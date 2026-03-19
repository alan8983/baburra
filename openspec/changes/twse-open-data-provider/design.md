## Context

The Twelve Data client (`twelve-data.client.ts`) was created to fetch TW/HK stock prices but its free tier doesn't cover TWSE/HKEX exchanges. TWSE provides official Open Data APIs that are free, keyless, and return OHLCV data for all listed stocks.

The stock price repository already has market-based dispatch (TW/HK → Twelve Data, US/CRYPTO → Tiingo). We need to swap the TW dispatch target from Twelve Data to TWSE Open Data, and gracefully handle HK (deferred).

## Goals / Non-Goals

**Goals:**
- Fetch daily OHLCV for TW stocks via TWSE Open Data (free, no API key)
- Support both "today's data" and "historical month" endpoints
- Normalize TWSE responses to `TiingoPriceRow[]` for pipeline compatibility
- Handle ROC calendar date format (民國年) ↔ Gregorian conversion
- Remove Twelve Data client and `TWELVE_DATA_API_KEY` dependency
- HK market dispatch returns `[]` gracefully (not broken, just deferred)

**Non-Goals:**
- HK stock price support (needs separate data source — deferred)
- Real-time or intraday data (EOD daily is sufficient)
- Adding new npm dependencies
- Changing the `stock_prices` DB schema or cache strategy

## Decisions

### 1. Two TWSE endpoints, one client function

The TWSE historical endpoint (`/exchangeReport/STOCK_DAY`) returns a full month per request for a specific stock. Since our cache strategy stores by date range and we typically need 90–180 days of history, the client will make multiple monthly requests to cover the requested range.

The Open Data endpoint (`/v1/exchangeReport/STOCK_DAY_ALL`) returns today's data for all stocks in one request — useful for daily updates but returns only one day.

**Strategy:** Use the historical endpoint (`STOCK_DAY`) as the primary data source. It returns a full month of OHLCV per request, covering the exact stock we need. For a 90-day range, that's ~3 requests.

### 2. ROC calendar date conversion

TWSE uses Republic of China (ROC) calendar dates:
- Response date field: `1150318` → ROC year 115, month 03, day 18 → 2026-03-18
- Request date parameter: `20260318` (Gregorian YYYYMMDD format)
- Data row dates: `115/03/18` → 2026-03-18

Conversion: `gregorianYear = rocYear + 1911`

### 3. Ticker format: strip `.TW` suffix

Our AI stores TW tickers as `2330.TW`. TWSE expects just the stock code: `2330`.

```
Stored ticker     TWSE API call
─────────────     ──────────────────────────────
2330.TW      →    stockNo=2330&date=20260318
```

### 4. Response format normalization

TWSE `STOCK_DAY` returns:
```json
{
  "stat": "OK",
  "title": "115年03月 2330 台積電 各日成交資訊",
  "fields": ["日期","成交股數","成交金額","開盤價","最高價","最低價","收盤價","漲跌價差","成交筆數","註記"],
  "data": [
    ["115/03/02","57,404,594","113,190,016,272","1,940.00","1,995.00","1,940.00","1,975.00","-20.00","325,611",""]
  ]
}
```

Field mapping (0-indexed):
- `[0]` 日期 → date (ROC format, needs conversion)
- `[1]` 成交股數 → volume (comma-separated string)
- `[3]` 開盤價 → open (comma-separated string)
- `[4]` 最高價 → high
- `[5]` 最低價 → low
- `[6]` 收盤價 → close

Numbers have commas (e.g., `"1,940.00"`) that must be stripped before parsing. Some rows may have `"--"` for prices (e.g., suspended trading) — skip those.

### 5. Error handling: same pattern as Tiingo

- `stat !== "OK"` / empty data → return `[]` (triggers stale-cache fallback)
- Network error → throw (triggers stale-cache fallback)
- No special retry logic (matches Tiingo/existing behavior)

### 6. HK market: graceful empty

The repository dispatch for `market === 'HK'` will log a warning and return `[]`. This matches pre-Twelve-Data behavior and doesn't break anything — just no chart data for HK stocks until a future change adds an HK data source.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                stock-price.repository.ts               │
│                                                        │
│  getStockPrices(ticker)                                │
│    ├─ resolveStock(ticker) → { id, market }            │
│    ├─ readCachedPrices(stockId, ...) ← unchanged       │
│    │                                                   │
│    ├─ if market = US/CRYPTO                            │
│    │   └─ fetchTiingoPrices()  ← tiingo.client.ts      │
│    │                                                   │
│    ├─ if market = TW                                   │
│    │   └─ fetchTwsePrices()    ← twse.client.ts        │
│    │                                                   │
│    ├─ if market = HK                                   │
│    │   └─ return [] (deferred)                         │
│    │                                                   │
│    └─ writePricesToCache(stockId, ...) ← unchanged     │
└──────────────────────────────────────────────────────┘
```

## File Changes

| File | Change |
| --- | --- |
| `src/infrastructure/api/twse.client.ts` | **New** — TWSE Open Data client |
| `src/infrastructure/api/twelve-data.client.ts` | **Delete** — Replaced by TWSE client |
| `src/infrastructure/api/__tests__/twse.client.test.ts` | **New** — Unit tests for TWSE client |
| `src/infrastructure/api/__tests__/twelve-data.client.test.ts` | **Delete** — No longer needed |
| `src/infrastructure/repositories/stock-price.repository.ts` | Update dispatch: TW → TWSE, HK → empty |
| `src/infrastructure/repositories/__tests__/stock-price.repository.test.ts` | Update mocks & tests |
| `CLAUDE.md` | Remove `TWELVE_DATA_API_KEY` from Required Variables |
| `openspec/specs/data-models.md` | Update stock_prices source note |

## Risks / Trade-offs

- **[Risk] TWSE API availability/uptime** → Mitigation: It's an official government Open Data endpoint, generally reliable. The existing stale-cache fallback handles temporary outages.
- **[Risk] ROC date parsing edge cases** → Mitigation: Unit tests cover conversion. The format is well-documented and stable.
- **[Risk] Comma-separated number strings** → Mitigation: Simple `replace(/,/g, '')` before `parseFloat`. Unit tests verify.
- **[Risk] TWSE may throttle heavy usage** → Mitigation: Our Supabase cache prevents redundant requests. At most ~3 requests per stock (3 months of monthly data).
- **[Trade-off] HK deferred** → Accepted: Better to ship working TW support now than block on finding an HK data source. HK returns empty gracefully.
- **[Trade-off] Monthly endpoint = multiple requests for long ranges** → Accepted: 3 requests for 90 days is fine. The cache prevents repeat fetches.
