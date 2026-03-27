## Overview

This is a verification-only change — no code modifications. We execute two previously-blocked credit system tests using the now-accessible Gemini API, and verify data integrity at the Supabase layer.

## Test Plan

### Test A: Gemini Transcription Credit Consumption

**Scenario**: Scrape a short captionless YouTube video (< 5 min) → Gemini transcribes it → credits deducted at 7/min rate.

**Steps**:
1. Query Supabase `ai_usage` for current credit balance before test
2. Find a short YouTube video (~2-3 min) without captions
3. Via Preview: navigate to `/scrape`, paste the video's channel URL, discover, select the captionless video, confirm scrape
4. Wait for scrape job completion (poll `/api/scrape/jobs/{id}`)
5. Query Supabase `ai_usage` for balance after — verify credits deducted (expected: ~14-21 credits for 2-3 min video)
6. Query Supabase `transcripts` table — verify transcript row created with correct `video_id` and `content` not null
7. Query Supabase `posts` table — verify post created with analysis data

### Test B: Transcript Cache Hit

**Scenario**: Re-scrape the same captionless video → should use cached transcript → only 2 credits (caption analysis), not 7/min again.

**Steps**:
1. Record credit balance after Test A
2. Delete the post created in Test A (but NOT the transcript) to allow re-import
3. Re-scrape the same video URL
4. Query `ai_usage` — verify only 2 credits deducted (not 7/min)
5. Query `transcripts` table — verify no new transcript row created (cache hit)

## Supabase Queries

```sql
-- Check credit balance
SELECT balance, weekly_limit, reset_at FROM ai_usage WHERE user_id = '{DEV_USER_ID}';

-- Check transcript exists
SELECT id, video_id, created_at, char_length(content) as content_length
FROM transcripts WHERE video_id = '{videoId}';

-- Check post created with analysis
SELECT id, kol_id, sentiment, created_at
FROM posts WHERE source_url LIKE '%{videoId}%' ORDER BY created_at DESC LIMIT 1;
```

## Success Criteria

- Test A: Credits deducted at 7/min rate (±1 credit tolerance for rounding)
- Test A: Transcript row exists with non-null content
- Test A: Post created with sentiment analysis
- Test B: Only 2 credits deducted (caption analysis rate, not transcription rate)
- Test B: No new transcript row (cache hit confirmed)
