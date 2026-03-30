# Design: Fix Issues #35, #36, #37

## #35: Downgrade enrichPriceChanges log severity

### Current behavior

```
GET /api/posts → enrichPostsWithPriceChanges()
  → getStockPrices("ONDS")  → timeout → console.error(...)
  → getStockPrices("0050.TW") → timeout → console.error(...)
  → getStockPrices("BTC")   → timeout → console.error(...)
  → ... (14 stocks, 14 error lines)
```

Every failed stock produces a `console.error`. This is correct severity for unexpected failures, but these timeouts are expected degradation — the page still loads with `N/A` badges.

### Fix

Replace per-stock `console.error` with aggregated logging:

```ts
// After Promise.allSettled loop
const failedTickers: string[] = [];
for (let i = 0; i < entries.length; i++) {
  const [stockId, ticker] = entries[i];
  const result = results[i];
  if (result.status === 'rejected') {
    failedTickers.push(ticker);
  }
  candlesByStock[stockId] = result.status === 'fulfilled' ? result.value.candles : [];
}

if (failedTickers.length > 0) {
  if (failedTickers.length === entries.length) {
    console.warn(
      `[enrichPriceChanges] All ${failedTickers.length} stocks failed — price data unavailable`
    );
  } else {
    console.debug(
      `[enrichPriceChanges] ${failedTickers.length}/${entries.length} stocks failed: ${failedTickers.join(', ')}`
    );
  }
}
```

**Log levels:**
- All stocks fail → `console.warn` (systemic issue, worth noticing)
- Some stocks fail → `console.debug` (partial degradation, normal)
- No failures → no log

---

## #36: Invert postedAt priority

### Current behavior

```
import-pipeline.service.ts:428-432

postedAt: analysis.postedAt          ← 1st: AI guess (UNRELIABLE for transcripts)
  ? new Date(analysis.postedAt)
  : fetchResult.postedAt             ← 2nd: structured metadata (RELIABLE)
    ? new Date(fetchResult.postedAt)
    : new Date()                     ← 3rd: fallback to today
```

For captionless YouTube videos:
- Extractor gets correct date from `<meta itemprop="datePublished">` → `fetchResult.postedAt = "2025-07-28"`
- AI prompt includes `今天的日期是: 2026-03-30` → AI guesses today → `analysis.postedAt = "2026-03-30"`
- AI guess wins → wrong date stored

### Fix

Invert to: structured metadata > AI guess > fallback:

```ts
postedAt: fetchResult.postedAt
  ? new Date(fetchResult.postedAt)
  : analysis.postedAt
    ? new Date(analysis.postedAt)
    : new Date(),
```

**Why global, not YouTube-specific:**

| Platform | Extractor date source | Reliability |
|----------|----------------------|-------------|
| YouTube | `<meta datePublished>` / YouTube Data API v3 | High — YouTube's own structured data |
| Twitter | Tweet ID timestamp / API `created_at` | High — platform-generated |
| Threads | JSON-LD `datePublished` | High — platform metadata |
| Facebook | JSON-LD `datePublished` | High — platform metadata |

In every case, the extractor's structured metadata is more reliable than AI inference from unstructured text. The AI `postedAt` is only useful as fallback when extractors return `null`.

---

## #37: Increase max video duration

### Current behavior

```ts
const MAX_VIDEO_DURATION_SECONDS = 45 * 60; // 45 minutes
```

Videos > 45 min rejected with error message.

### Fix

```ts
const MAX_VIDEO_DURATION_SECONDS = 60 * 60; // 60 minutes
```

### Timeout validation

The dynamic timeout formula in `gemini.client.ts`:
```
timeout = max(180_000, min(600_000, 60_000 + durationSeconds * 4_000))
```

For a 60-min (3600s) video: `min(600_000, 60_000 + 14_400_000) = 600_000ms` (10 min).

The formula already caps at 600s for any video >= 135s. A 60-min video gets the same 10-min timeout as a 45-min video. No formula change needed.
