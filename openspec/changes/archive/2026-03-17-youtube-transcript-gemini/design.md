# Design: YouTube Transcript + Credit System

## Architecture Overview

Two interconnected changes: (1) YouTube transcription pipeline, (2) credit system replacing the flat quota model.

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSCRIPTION FLOW                            │
│                                                                  │
│  YouTube URL                                                     │
│       │                                                          │
│       ▼                                                          │
│  Check transcripts table (cache)                                │
│       │                                                          │
│       ├── HIT → use cached transcript (cost: 7 credits/min)     │
│       │                                                          │
│       └── MISS → Try caption scraping (FREE)                    │
│                    │                                             │
│                    ├── SUCCESS → save transcript → analyze       │
│                    │             (cost: 2 credits total)         │
│                    │                                             │
│                    └── FAILED → Gemini multimodal transcribe     │
│                                 (cost: 7 credits/min)           │
│                                 → save transcript → analyze     │
│                                                                  │
│  Transcript stored in `transcripts` table keyed by source_url   │
│  Shared across ALL users — pay once, cache forever              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Gemini Multimodal Transcription

### YouTubeExtractor changes

```
┌─────────────────────────────────────────────────────────────────┐
│                    YouTubeExtractor.extract()                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. fetchOEmbed()  ──→  title, author (unchanged)               │
│  2. fetchPageData() ──→  publishDate (unchanged)                │
│  3. Try caption scrape ──→ transcript text                      │
│     │                                                            │
│     ├─ SUCCESS: return { content: transcript, ... }              │
│     │           captionSource: 'caption'                         │
│     │                                                            │
│     └─ FAILED: return { content: null, ... }                     │
│                captionSource: 'none'                             │
│                                                                  │
│  No more description fallback. Content is either transcript      │
│  or null (signals caller to use Gemini multimodal).              │
└─────────────────────────────────────────────────────────────────┘
```

### New function: `geminiTranscribeVideo()`

Location: `src/infrastructure/api/gemini.client.ts`

```ts
// Request body structure
{
  contents: [{
    parts: [
      { text: "Transcribe the spoken content of this video in its original language. Output only the transcript text, no timestamps or speaker labels." },
      { file_data: { mime_type: "video/youtube", file_uri: youtubeUrl } }
    ]
  }],
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 8192,
  }
}
```

- **Model**: `gemini-2.5-flash` (not flash-lite) — better audio understanding
- **Timeout**: 120s (videos take longer)
- **Video cap**: 45 minutes max

### Token cost per video length

| Video length | Video tokens (300/s) | Audio tokens (32/s) | Total input | Approx USD |
|-------------|---------------------|--------------------:|-------------|------------|
| 5 min       | 90K                 | 9.6K                | ~100K       | ~$0.04     |
| 15 min      | 270K                | 28.8K               | ~300K       | ~$0.16     |
| 30 min      | 540K                | 57.6K               | ~600K       | ~$0.24     |
| 45 min      | 810K                | 86.4K               | ~900K       | ~$0.35     |

### Transcript Storage

New `transcripts` table (separate from posts):

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

**Why separate table?**
- Transcript is tied to a URL, not a post (same video → multiple KOLs)
- Enables caching across users (shared transcription flywheel)
- Keeps posts table lean (transcripts can be 50K+ chars)

### Import pipeline flow

```ts
// In import-pipeline.service.ts processUrl()
async function processUrl(url, ...) {
  const fetchResult = extractor.extract(url);

  if (fetchResult.content === null && fetchResult.captionSource === 'none') {
    // YouTube with no captions — need Gemini transcription
    const cached = await findTranscriptByUrl(url);
    if (cached) {
      fetchResult.content = cached.content;
    } else {
      // Consume credits for transcription (7/min)
      const duration = fetchResult.durationSeconds ?? 600; // default 10 min
      const transcriptionCredits = Math.ceil(duration / 60) * 7;
      await consumeCredits(userId, transcriptionCredits, 'video_transcription');

      const transcript = await geminiTranscribeVideo(url);
      await saveTranscript({ sourceUrl: url, content: transcript, source: 'gemini', durationSeconds: duration });
      fetchResult.content = transcript;
    }
  } else if (fetchResult.content && fetchResult.captionSource === 'caption') {
    // Save caption transcript to cache for future reuse
    await saveTranscript({ sourceUrl: url, content: fetchResult.content, source: 'caption' });
  }

  // Text analysis (costs 1-2 credits depending on type)
  await consumeCredits(userId, creditCost, 'text_analysis');
  const analysis = await analyzeDraftContent(fetchResult.content);
}
```

---

## Part 2: Credit System

### Current system (to be replaced)

```
profiles table:
  ai_usage_count INTEGER     -- flat counter, +1 per action
  ai_usage_reset_at TIMESTAMPTZ
  subscription_tier TEXT     -- 'free' | 'premium'

Constants:
  FREE_WEEKLY_LIMIT: 15
  PREMIUM_WEEKLY_LIMIT: 100

RPC functions:
  consume_ai_quota()   -- atomic +1
  refund_ai_quota()    -- atomic -1
```

### New system

```
profiles table:
  credit_balance INTEGER DEFAULT 850     -- current credits
  credit_reset_at TIMESTAMPTZ           -- weekly reset timestamp
  subscription_tier TEXT DEFAULT 'free'  -- 'free' | 'pro' | 'max'

Constants:
  CREDIT_LIMITS = {
    free: 850,       // ~120 min YT transcription/week
    pro: 4200,       // ~600 min
    max: 21000,      // ~3,000 min
  }

  CREDIT_COSTS = {
    text_analysis: 1,           // tweet/threads scrape + analyze
    youtube_caption_analysis: 2, // YT w/ captions scrape + analyze
    video_transcription_per_min: 7,  // per minute of video
    reroll_analysis: 3,          // manual re-analysis
  }
```

### Migration strategy

Replace existing quota columns in `profiles`:

```sql
-- Add new columns
ALTER TABLE profiles ADD COLUMN credit_balance INTEGER DEFAULT 850;
ALTER TABLE profiles ADD COLUMN credit_reset_at TIMESTAMPTZ;

-- Migrate existing data
UPDATE profiles SET
  credit_balance = CASE
    WHEN subscription_tier = 'premium' THEN 4200  -- map to pro
    ELSE 850
  END,
  credit_reset_at = ai_usage_reset_at,
  subscription_tier = CASE
    WHEN subscription_tier = 'premium' THEN 'pro'
    ELSE subscription_tier
  END;

-- Drop old columns (after verifying migration)
ALTER TABLE profiles DROP COLUMN ai_usage_count;
ALTER TABLE profiles DROP COLUMN ai_usage_reset_at;
```

### New RPC functions

Replace `consume_ai_quota()` and `refund_ai_quota()`:

```sql
-- consume_credits(p_user_id UUID, p_amount INTEGER, p_operation TEXT)
-- Atomically deducts credits, resets if past reset date, throws if insufficient
CREATE OR REPLACE FUNCTION consume_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_operation TEXT DEFAULT 'unknown'
)
RETURNS JSONB AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_weekly_limit INTEGER;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;

  -- Determine weekly limit
  v_weekly_limit := CASE v_profile.subscription_tier
    WHEN 'pro' THEN 4200
    WHEN 'max' THEN 21000
    ELSE 850
  END;

  -- Reset if past reset date
  IF v_profile.credit_reset_at IS NULL OR NOW() > v_profile.credit_reset_at THEN
    v_profile.credit_balance := v_weekly_limit;
    v_profile.credit_reset_at := NOW() + INTERVAL '7 days';
  END IF;

  -- Check sufficient credits
  IF v_profile.credit_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS'
      USING DETAIL = json_build_object(
        'required', p_amount,
        'available', v_profile.credit_balance,
        'operation', p_operation
      )::TEXT;
  END IF;

  -- Deduct
  UPDATE profiles SET
    credit_balance = v_profile.credit_balance - p_amount,
    credit_reset_at = v_profile.credit_reset_at
  WHERE id = p_user_id;

  RETURN json_build_object(
    'credit_balance', v_profile.credit_balance - p_amount,
    'credit_reset_at', v_profile.credit_reset_at,
    'subscription_tier', v_profile.subscription_tier,
    'weekly_limit', v_weekly_limit,
    'consumed', p_amount,
    'operation', p_operation
  );
END;
$$ LANGUAGE plpgsql;
```

```sql
-- refund_credits(p_user_id UUID, p_amount INTEGER)
CREATE OR REPLACE FUNCTION refund_credits(p_user_id UUID, p_amount INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_weekly_limit INTEGER;
  v_new_balance INTEGER;
BEGIN
  SELECT CASE subscription_tier
    WHEN 'pro' THEN 4200 WHEN 'max' THEN 21000 ELSE 850
  END INTO v_weekly_limit FROM profiles WHERE id = p_user_id;

  UPDATE profiles
  SET credit_balance = LEAST(credit_balance + p_amount, v_weekly_limit)
  WHERE id = p_user_id
  RETURNING credit_balance INTO v_new_balance;

  RETURN json_build_object('credit_balance', v_new_balance, 'refunded', p_amount);
END;
$$ LANGUAGE plpgsql;
```

### Repository changes

Update `ai-usage.repository.ts` → rename to `credit.repository.ts`:

```ts
export interface CreditInfo {
  balance: number;
  weeklyLimit: number;
  resetAt: Date | null;
  subscriptionTier: 'free' | 'pro' | 'max';
}

export async function getCreditInfo(userId: string): Promise<CreditInfo>
export async function consumeCredits(userId: string, amount: number, operation: string): Promise<CreditInfo>
export async function refundCredits(userId: string, amount: number): Promise<CreditInfo>
```

### API route changes

- `GET /api/ai/usage` → update response shape to `CreditInfo`
- `POST /api/ai/analyze` → consume `CREDIT_COSTS.reroll_analysis` (3 credits) for re-roll
- `POST /api/ai/extract-arguments` → bundled in scrape cost, no separate charge
- Scrape pipeline → consume variable credits based on operation type

### Hook changes

Update `useAiUsage()` → `useCreditInfo()` (or keep name, change return type):

```ts
export interface CreditInfo {
  balance: number;
  weeklyLimit: number;
  resetAt: Date | null;
  tier: 'free' | 'pro' | 'max';
}
```

### UI changes

Update `ai-quota-badge.tsx` → show credits instead of quota:
- Display: "credits icon 720 / 850" (balance / limit)
- Color coding: same thresholds (>50% green, 20-50% yellow, <20% red)
- Tooltip: "重置時間: X天後" (reset in X days)

---

## Part 3: Fee Estimation in Scrape Flow

### Caption availability check

```ts
// New function in youtube.extractor.ts
async checkCaptionAvailability(videoId: string): Promise<{
  hasCaptions: boolean;
  estimatedDurationSeconds: number | null;
  estimatedCreditCost: number;
}>
```

- Use `YoutubeTranscript.listTranscripts(videoId)` to check without fetching
- Extract duration from YouTube page HTML (`"lengthSeconds"`)
- Credit cost: 2 (has captions) or `Math.ceil(duration/60) * 7` (no captions)

### UI in URL discovery step

```
┌─────────────────────────────────────────────────────────┐
│  探索與選擇                                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ☑ 全面了解SpaceX星链...      ⚠ 無字幕 15min  105點   │
│  ☑ 看了这么多次火箭实验室...  ⚠ 無字幕 20min  140點   │
│  ☑ SpaceX上市引爆太空投资...  ⚠ 無字幕 12min   84點   │
│  ☑ RKLB earnings analysis...  ✓ 有字幕          2點   │
│                                                          │
│  ────────────────────────────────────────────────────    │
│  預估消耗: 331 點  │  剩餘: 720 / 850 本週             │
│  💡 1分鐘無字幕YouTube影片 = 7點                        │
│                                                          │
│  [返回]                              [確認擷取 (4)]     │
└─────────────────────────────────────────────────────────┘
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Caption fetch fails | Log warning, proceed to Gemini transcription |
| Gemini transcription fails | Refund credits, return error for this URL |
| Gemini transcription timeout (>120s) | Refund credits, return error |
| Video >45 min | Skip with user-friendly message, no credit charge |
| Insufficient credits | Show warning, disable confirm, suggest reducing selection |
| Transcript cached | Use cache, charge user credits, skip Gemini call |

---

## Caching Strategy

```
Before Gemini transcription:
  1. Check transcripts table by source_url
  2. If found → use cached content, skip Gemini (our cost = $0)
  3. User still pays credits (they pay for value, not our cost)
  4. This is the shared transcription flywheel that drives profitability
```
