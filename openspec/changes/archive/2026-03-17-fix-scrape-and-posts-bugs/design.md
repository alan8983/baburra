# Design: Fix Scrape Pipeline & Posts Page Bugs

## Bug 1: Scrape flow completion detection

### Current behavior
```
ScrapeProgress mounts → job is already "completed" → prevStatusRef = undefined
Condition: undefined && ... → false → no redirect, no toast
UI stuck at Step 3 forever
```

### Fix
In `scrape-progress.tsx` useEffect (line 67), change:
```ts
if (prevStatus && prevStatus !== 'completed' && job.status === 'completed')
```
to:
```ts
if ((!prevStatus || prevStatus !== 'completed') && job.status === 'completed')
```

This triggers completion when:
- `prevStatus` is `undefined` (first render, job already completed) — NEW
- `prevStatus` is any non-completed status transitioning to `completed` — EXISTING

### Step 4 missing state
The `stateToStep` function in `scrape/page.tsx` maps:
- `'processing'` → 3
- `'redirecting'` → 5 (skips 4)

Options:
1. **Remove Step 4** from `ScrapeFlowChart` (simplest — Step 4 "匯入" is not a distinct user-visible phase)
2. Add an `'importing'` state triggered when job status transitions to `completed` before redirect

**Decision**: Option 1 — simplify to 4 steps. The "匯入" step is an implementation detail, not user-meaningful. Rename steps to: 輸入URL → 探索與選擇 → 處理中 → 完成

## Bug 2: Duplicate posts

### Current behavior
```
Batch processor (concurrent):
  Thread A: findPostBySourceUrl(url) → null (not yet created)
  Thread B: findPostBySourceUrl(url) → null (not yet created)
  Thread A: createPost(url) → success
  Thread B: createPost(url) → success (DUPLICATE!)
```

### Fix: DB constraint + catch-and-return
1. Add migration: `ALTER TABLE posts ADD CONSTRAINT posts_source_url_kol_id_key UNIQUE (source_url, kol_id);`
   - Note: `source_url` can be NULL (manual posts), so only non-NULL values are constrained
   - First clean up existing duplicates before adding constraint

2. In `import-pipeline.service.ts` processUrl(), wrap `createPost()` in try-catch:
   - If duplicate key error → `findPostBySourceUrl(url)` → return as `'duplicate'`
   - This mirrors the pattern already used for `createStock` upsert fix

### Migration steps
1. Find and delete duplicate posts (keep earliest `created_at`)
2. Add unique constraint on `(source_url, kol_id)` where `source_url IS NOT NULL`

## Bug 3: Posts page loading timeout

### Current behavior
```
GET /api/posts
  → listPosts() (fast, ~200ms)
  → enrichPostsWithPriceChanges() (SLOW — fetches Tiingo for each stock)
    → Promise.allSettled([
        getStockPrices("RKLB"),  // may timeout
        getStockPrices("ASTS"),  // may timeout
        getStockPrices("SATS"),  // may timeout
        ...
      ])
```

### Fix: Add per-stock timeout
In `enrich-price-changes.ts`, wrap each `getStockPrices()` call with a timeout:
```ts
const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

const results = await Promise.allSettled(
  entries.map(([, ticker]) => withTimeout(getStockPrices(ticker, { startDate }), 5000))
);
```

On timeout, the stock simply gets no price data (already handled by the `result.status === 'rejected'` branch at line 41). The page still loads with whatever data succeeded.

## Bug 4: YouTube extractor silent failure

### Current behavior
```ts
try {
  const transcript = await YoutubeTranscript.fetchTranscript(videoId);
  content = transcript.map(segment => segment.text).join(' ');
} catch {                    // ← swallows ALL errors, no logging
  // fallback to description
}
```

### Fix
1. Add logging: `console.warn(`[YouTubeExtractor] Transcript unavailable for ${videoId}:`, error)`
2. Use `shortDescription` (already parsed) as primary fallback instead of truncated `<meta>` description
3. The `fetchPageData` method already extracts `shortDescription` at line 182-188 — ensure it's used before falling back to `<meta>` description

Current fallback order: title → `<meta>` description (truncated ~200 chars)
New fallback order: title → `shortDescription` (full, can be 1000+ chars) → `<meta>` description
