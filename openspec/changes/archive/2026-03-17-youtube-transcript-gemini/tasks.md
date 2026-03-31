# Tasks: YouTube Transcript + Credit System

## Phase 1: Credit System (do this FIRST — other phases depend on it)

- [x] **1.1** Create DB migration for credit system
  - Add `credit_balance INTEGER DEFAULT 850` and `credit_reset_at TIMESTAMPTZ` to profiles
  - Migrate existing `ai_usage_count` / `ai_usage_reset_at` data
  - Map `subscription_tier = 'premium'` → `'pro'`
  - Drop old `ai_usage_count` and `ai_usage_reset_at` columns
  - Update `subscription_tier` CHECK constraint to allow `'free' | 'pro' | 'max'`

- [x] **1.2** Create new RPC functions in migration
  - `consume_credits(p_user_id UUID, p_amount INTEGER, p_operation TEXT)` — atomic deduction with weekly reset, throws `INSUFFICIENT_CREDITS`
  - `refund_credits(p_user_id UUID, p_amount INTEGER)` — atomic refund capped at weekly limit
  - Drop old `consume_ai_quota()` and `refund_ai_quota()` functions

- [x] **1.3** Update domain model in `src/domain/models/user.ts`
  - Replace `AI_QUOTA` constants with `CREDIT_LIMITS` and `CREDIT_COSTS`
  - Update `Profile` interface: `creditBalance`, `creditResetAt`, `subscriptionTier: 'free' | 'pro' | 'max'`
  - Add credit cost constants:
    ```ts
    export const CREDIT_LIMITS = { free: 850, pro: 4200, max: 21000 } as const;
    export const CREDIT_COSTS = {
      text_analysis: 1,
      youtube_caption_analysis: 2,
      video_transcription_per_min: 7,
      reroll_analysis: 3,
    } as const;
    ```

- [x] **1.4** Update repository: refactored `ai-usage.repository.ts` with credit system + backward-compat aliases
  - New interface: `CreditInfo { balance, weeklyLimit, resetAt, subscriptionTier }`
  - Functions: `getCreditInfo()`, `consumeCredits(userId, amount, operation)`, `refundCredits(userId, amount)`
  - Call new RPC functions instead of old ones
  - Keep backward-compatible export if other files import from old name (or update all imports)

- [x] **1.5** Update API routes
  - `GET /api/ai/usage` → return `CreditInfo` shape (balance, weeklyLimit, resetAt, tier)
  - `POST /api/ai/analyze` → consume `CREDIT_COSTS.reroll_analysis` (3 credits)
  - `POST /api/ai/extract-arguments` → no separate charge (bundled in scrape)
  - Update error responses: `AI_QUOTA_EXCEEDED` → `INSUFFICIENT_CREDITS`

- [x] **1.6** Update hooks in `src/hooks/use-ai.ts`
  - Update return types to use `CreditInfo`
  - Query key can stay `['ai-usage']` for cache compatibility

- [x] **1.7** Update UI component `src/components/ai/ai-quota-badge.tsx`
  - Display credits: "720 / 850" format
  - Same color thresholds (>50% green, 20-50% yellow, <20% red)
  - Update tooltip text

- [x] **1.8** Update translation files for credit terminology (core strings updated, remaining strings deferred)
  - Updated common.json: 配額 → 點數, Quota → Credits
  - Remaining translation files (import, settings, posts, onboarding) can be updated incrementally

## Phase 2: Gemini Multimodal Transcription

- [ ] **2.1** Add `geminiTranscribeVideo()` to `src/infrastructure/api/gemini.client.ts`
  - Accept YouTube URL, send as `file_data` with `mime_type: "video/youtube"`
  - Use `gemini-2.5-flash` model (not flash-lite)
  - Set `maxOutputTokens: 8192`, `temperature: 0.1`
  - Increase timeout to 120s
  - Prompt: transcribe spoken content in original language, text only

- [ ] **2.2** Create `transcripts` table migration in `supabase/migrations/`
  ```sql
  CREATE TABLE transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    source VARCHAR(20) NOT NULL, -- 'caption' | 'gemini'
    language VARCHAR(10),
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE INDEX idx_transcripts_source_url ON transcripts(source_url);
  ```

- [ ] **2.3** Create `src/infrastructure/repositories/transcript.repository.ts`
  - `findTranscriptByUrl(sourceUrl: string): Promise<Transcript | null>`
  - `saveTranscript(input): Promise<Transcript>`

- [x] **2.4** Update `YouTubeExtractor` in `src/infrastructure/extractors/youtube.extractor.ts`
  - Remove description fallback entirely
  - When caption fetch fails: return `content = null`, `captionSource: 'none'`
  - When caption succeeds: return `captionSource: 'caption'`
  - Add `captionSource` to `UrlFetchResult` type
  - Add duration extraction from page HTML
  - Log warning on caption unavailability

- [x] **2.5** Update `processUrl()` in `src/domain/services/import-pipeline.service.ts`
  - If `content === null` (YouTube, no captions):
    1. Check transcript cache → if hit, use cached
    2. If miss: calculate credits (`Math.ceil(duration/60) * 7`), consume credits, call `geminiTranscribeVideo()`, save transcript
  - If content exists with `captionSource: 'caption'`: save to transcript cache
  - Increase content char limit from 10K to 50K
  - Reject videos >45 min with user-friendly error
  - Use `consumeCredits()` instead of old `consumeAiQuota()`

## Phase 3: Fee Estimation UI

- [x] **3.1** Add `checkCaptionAvailability()` to `YouTubeExtractor`
  - Lightweight check: `YoutubeTranscript.listTranscripts(videoId)` or similar
  - Extract video duration from page HTML `"lengthSeconds"`
  - Return: `{ hasCaptions, estimatedDurationSeconds, estimatedCreditCost }`

- [x] **3.2** Update scrape discovery endpoint to include per-URL cost info
  - For each YouTube URL: call `checkCaptionAvailability()`
  - For non-YouTube URLs: always `estimatedCreditCost: 1`
  - Add to response: `captionAvailable`, `durationSeconds`, `estimatedCreditCost`

- [x] **3.3** Update `UrlDiscoveryList` component
  - Per-URL: caption status icon + credit cost badge
  - Footer: total estimated credits, remaining balance, user-facing note ("1分鐘無字幕影片 = 7點")
  - Disable confirm button if insufficient credits
  - Fetch credit info from `/api/ai/usage`

- [x] **3.4** Update translation files for fee estimation strings

## Verification

- [ ] **4.1** Test credit consumption for text post (tweet) — verify 1 credit consumed
- [ ] **4.2** Test credit consumption for YouTube w/ captions — verify 2 credits consumed
- [ ] **4.3** Test Gemini transcription for captionless video — verify 7/min credits consumed, transcript saved
- [ ] **4.4** Test transcript cache — re-scrape same URL → uses cache, still charges credits, no Gemini call
- [ ] **4.5** Test re-roll analysis — verify 3 credits consumed
- [ ] **4.6** Test insufficient credits — verify warning shown, operation blocked
- [ ] **4.7** Test video >45 min — verify rejection with message
- [ ] **4.8** Test weekly credit reset — verify balance resets to tier limit

---

## Session Handoff Prompts

### For Phase 1 (Credit System — START HERE):
```
Read openspec/changes/youtube-transcript-gemini/design.md and proposal.md for full context.

Replace the flat "1 quota per action" system with a variable-cost credit system.

Current system: profiles table has ai_usage_count (flat +1 per action), ai_usage_reset_at,
subscription_tier ('free'|'premium'). RPC functions: consume_ai_quota(), refund_ai_quota().

New system:
- profiles: credit_balance INTEGER (replaces ai_usage_count), credit_reset_at,
  subscription_tier ('free'|'pro'|'max')
- Tiers: free=850/wk, pro=4200/wk, max=21000/wk
- New RPC: consume_credits(user_id, amount, operation), refund_credits(user_id, amount)
- Credit costs: text_analysis=1, youtube_caption=2, video_transcription=7/min, reroll=3

Key files to modify:
1. New migration in supabase/migrations/ (add columns, migrate data, create RPC, drop old)
2. src/domain/models/user.ts — replace AI_QUOTA with CREDIT_LIMITS + CREDIT_COSTS
3. src/infrastructure/repositories/ai-usage.repository.ts → refactor to credit.repository.ts
4. src/app/api/ai/usage/route.ts — return CreditInfo shape
5. src/app/api/ai/analyze/route.ts — consume 3 credits for re-roll
6. src/hooks/use-ai.ts — update return types
7. src/components/ai/ai-quota-badge.tsx — show credits not quota
8. Translation files: replace 配額 with 點數

Existing tests in src/infrastructure/repositories/__tests__/ai-usage.repository.test.ts
need updating too.
```

### For Phase 2 (Gemini Transcription):
```
Read openspec/changes/youtube-transcript-gemini/design.md for full context.
Phase 1 (credit system) must be completed first.

Implement Gemini multimodal video transcription for YouTube videos without captions.

Key changes:
1. Add geminiTranscribeVideo() to src/infrastructure/api/gemini.client.ts
   - Use file_data with mime_type "video/youtube" and file_uri as YouTube URL
   - Model: gemini-2.5-flash (paid tier), maxOutputTokens: 8192, temperature: 0.1, timeout: 120s

2. Create transcripts table migration in supabase/migrations/
   - Columns: id, source_url (UNIQUE), content, source ('caption'|'gemini'), language,
     duration_seconds, created_at

3. Create transcript.repository.ts with findTranscriptByUrl() and saveTranscript()

4. Update YouTubeExtractor (src/infrastructure/extractors/youtube.extractor.ts):
   - Remove description fallback entirely
   - When captions unavailable: return content=null, captionSource='none'
   - Extract video duration from page HTML "lengthSeconds"

5. Update processUrl() in import-pipeline.service.ts:
   - If content is null: check transcript cache → if miss, consume credits + transcribe
   - Credit cost = Math.ceil(durationSeconds / 60) * 7
   - Save all transcripts to cache (both caption and gemini-sourced)
   - Increase content limit from 10K to 50K chars
   - Reject videos >45 minutes
   - Use consumeCredits() from credit.repository.ts
```

### For Phase 3 (Fee Estimation UI):
```
Read openspec/changes/youtube-transcript-gemini/design.md for full context.
Phases 1 and 2 must be completed first.

Add fee estimation to the scrape URL discovery step (Step 2).
Each discovered YouTube URL should show caption availability and estimated credit cost.

Key changes:
1. Add checkCaptionAvailability() to YouTubeExtractor — lightweight check using
   YoutubeTranscript.listTranscripts() + duration from page HTML "lengthSeconds"

2. Update /api/scrape/discover response to include per-URL: captionAvailable,
   durationSeconds, estimatedCreditCost

3. Update UrlDiscoveryList component (src/components/scrape/url-discovery-list.tsx):
   - Per-URL: caption icon + credit cost badge
   - Footer: total estimated credits, remaining balance
   - User note: "1分鐘無字幕YouTube影片 = 7點"
   - Disable confirm if total > remaining
   - Fetch credit info from /api/ai/usage

See design.md for the UI mockup.
```

### For Bug Fixes (separate change):
```
Read openspec/changes/fix-scrape-and-posts-bugs/design.md and tasks.md for full context.
This is independent of the credit system — can be done in parallel.

Four bugs to fix:
1. Scrape flow stuck at Step 3 — ScrapeProgress completion detection fails when job
   completes before component sees non-completed status. Fix in scrape-progress.tsx.
2. Duplicate posts — race condition in concurrent batch processing. Add UNIQUE constraint
   on (source_url, kol_id) + catch-and-fetch pattern in import-pipeline.service.ts.
3. Posts page timeout — enrichPostsWithPriceChanges() blocks on slow Tiingo API.
   Add 5s per-stock timeout with Promise.race() in enrich-price-changes.ts.
4. YouTube extractor silent failure — add console.warn in catch block, use shortDescription
   as fallback instead of truncated meta description.

See tasks.md for detailed file-by-file instructions.
```
