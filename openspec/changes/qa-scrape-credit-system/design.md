## Context

PR#11 (credit system + Gemini transcription + fee estimation), PR#12 (scrape UX + sidebar RWD), and commit ccd6c05 (Gemini fix + credit consumption fix) have all landed on main. Unit tests pass, but no end-to-end verification has been done against the live Supabase database. The dev environment uses `DEV_USER_ID` to bypass auth.

## Goals / Non-Goals

**Goals:**
- Verify all 12 QA scenarios with concrete DB evidence
- Confirm credit deductions are exact (1, 2, 7/min, 3 depending on operation)
- Confirm transcript caching prevents duplicate Gemini calls
- Confirm scrape job lifecycle completes correctly
- Document any bugs found for follow-up

**Non-Goals:**
- Automated E2E test creation (Playwright) — that's a separate effort
- Load testing or performance benchmarking
- Testing auth flows (we use DEV_USER_ID bypass)
- Testing the settings/profile UI

## Decisions

### 1. Use `qa-tester` skill for interactive verification

Run QA scenarios through the preview tool against the dev server. This gives us UI screenshots + network logs + console logs as evidence, combined with direct DB queries via Supabase CLI or API routes.

**Why not Playwright?** — These are one-time verification scenarios, not regression tests. Writing Playwright scripts would take longer than the manual verification.

### 2. Test execution order

```
Phase 1: Setup
  - Copy .env.local to worktree
  - npm install + dev server start
  - Record initial credit balance (snapshot)

Phase 2: Scrape Flow (A1-A4)
  A1: Scrape YouTube channel → verify completion detection
  A3: Re-scrape same URL → verify duplicate rejection
  A4: Check discovery list shows credit costs

Phase 3: Credit System (B1-B7)
  B1: Scrape tweet → verify 1 credit
  B2: Scrape YouTube w/ captions → verify 2 credits
  B3: Scrape captionless YouTube → verify 7/min credits + transcript
  B4: Delete post, re-scrape → verify cache hit (2 credits, no Gemini call)
  B5: Re-roll analysis → verify 3 credits
  B7: Scrape no-ticker URL → verify refund
  B6: Insufficient credits → verify block (do last, needs low balance)

Phase 4: Edge Cases (C1)
  C1: Video >45 min → verify rejection

Phase 5: UI (D1)
  D1: Resize to mobile → verify sidebar RWD
```

**Why this order?** — B3 must come before B4 (cache test depends on B3's transcript). B6 (insufficient credits) should be last since it requires a low balance. A1 naturally precedes A3 (need a post to duplicate).

### 3. DB verification via Supabase SQL queries

Use `supabase` CLI or direct API calls to run verification queries. Key queries:

```sql
-- Credit balance snapshot (before/after each scenario)
SELECT credit_balance FROM profiles WHERE id = '<DEV_USER_ID>';

-- Post existence check
SELECT id, source_url, sentiment, source_platform, created_at
FROM posts WHERE source_url = '<url>';

-- Duplicate count
SELECT count(*) FROM posts WHERE source_url = '<url>' AND kol_id = '<kolId>';

-- Transcript cache check
SELECT id, source, duration_seconds, length(content) as content_len
FROM transcripts WHERE source_url = '<url>';

-- Scrape job lifecycle
SELECT status, processed_urls, total_urls, imported_count,
       duplicate_count, error_count, filtered_count, completed_at
FROM scrape_jobs WHERE id = '<jobId>' ORDER BY created_at DESC;

-- KOL source status
SELECT scrape_status, posts_scraped_count
FROM kol_sources WHERE kol_id = '<kolId>';
```

### 4. Test URLs needed

| Type | Requirements | Example |
|------|-------------|---------|
| Tweet/article | Mentions a stock ticker (e.g., TSLA, AAPL) | Find a finance tweet |
| YouTube w/ captions | < 5 min, mentions stocks, has CC | Finance YouTuber short clip |
| YouTube w/o captions | < 5 min, mentions stocks, no CC | Less common — may need to search |
| YouTube > 45 min | Any long video | Easy to find |
| No-ticker URL | Content about non-stock topic | Lifestyle/cooking video |

We'll identify specific URLs at test time based on what's available.

## Risks / Trade-offs

- **[Risk] Credit consumption is real** → Test with dev user only. Monitor balance. Can reset via direct DB update if needed: `UPDATE profiles SET credit_balance = 850 WHERE id = '<DEV_USER_ID>';`
- **[Risk] Gemini API rate limits** → B3 scenario calls Gemini. If rate limited, wait and retry. Only 1 transcription call needed.
- **[Risk] Tiingo API may be slow/down** → A2 scenario tolerates this — the pass criteria is that the page loads with graceful degradation, not that all prices load.
- **[Risk] Captionless YouTube video hard to find** → May need to test with a video where caption extraction fails rather than truly captionless. The code path is the same.
