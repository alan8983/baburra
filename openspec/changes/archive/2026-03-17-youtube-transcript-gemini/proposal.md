# Proposal: YouTube Transcript + Credit System

## What

Two major changes bundled together:

1. **YouTube Transcription**: Replace the broken description-only fallback for captionless YouTube videos with a two-step approach: (1) try free caption scraping, (2) fall back to Gemini multimodal video transcription. Store transcripts in DB for reuse and future data science.

2. **Credit System**: Replace the flat "1 quota per action" system with a variable-cost credit system. Different operations cost different credits based on actual resource consumption. Three subscription tiers: Free, Pro ($9.99/mo), Max ($24.99/mo).

## Why

### Transcription
- Current system is broken for captionless videos — falls back to truncated YouTube `<meta>` description (~200 chars), producing garbage AI analysis.
- Disabled captions are common among Chinese-language finance KOLs — this is not an edge case.
- Storing raw transcript text enables future data science: keyword analysis, trend tracking, topic clustering, re-analysis.

### Credit System
- Video transcription via Gemini is ~670x more expensive than text analysis. A flat "1 quota per action" model is economically unsustainable.
- Different operations have wildly different costs: tweet analysis ~$0.0007, 30-min video transcription ~$0.24.
- Credits let users see the true cost of their actions and make informed decisions.

## Credit Tiers (Option B Pricing)

| Tier | Price/mo | Credits/week | YT transcription capacity |
|------|----------|-------------|--------------------------|
| Free | $0 | 850 | ~120 min/week |
| Pro | $9.99 | 4,200 | ~600 min/week |
| Max | $24.99 | 21,000 | ~3,000 min/week |

- **No rollover** — unused credits expire at weekly reset
- **Pro is the core revenue engine** (~90%+ of paid users expected)
- **Max serves as price anchor** (makes Pro look cheap) and safety valve for power users

## Credit Rates

| Operation | Credits | Notes |
|-----------|---------|-------|
| Scrape + analyze text post (tweet/threads) | 1 | Includes argument extraction for all stocks |
| Scrape + analyze YouTube w/ captions | 2 | Caption scraping is free, text analysis on flash-lite |
| YouTube video transcription (no captions) | 7/min | e.g. 15 min = 105 credits, 30 min = 210 credits |
| Re-roll analysis (any post) | 3 | User manually re-triggers sentiment reanalysis |
| Cached video (already transcribed by another user) | 7/min | Same cost to user — credits buy value, not our cost |

**User-facing note**: "1 minute of uncaptioned YouTube video = 7 credits"

## Shared Transcription Cache

Transcripts are stored in DB keyed by source URL. When User B requests the same video that User A already transcribed:
- User B still pays 7 credits/min (they're paying for the *value*, not our cost)
- Our actual cost is $0 (cached)
- This means **profit margin increases with user overlap** on popular KOLs

## Gemini API Tier

- Sign up for **Gemini paid tier** (Tier 1: $0.30/1M input, $2.50/1M output for Flash)
- Removes free tier rate limits (500 req/day → 2,000 RPM)
- Eliminates service quality issues from throttling
- Cost is usage-based, no monthly minimum

## Breakeven Analysis

At mature stage (80% cache hit rate), Pro-only breakeven requires ~5% conversion rate (industry benchmark: 2-5%). See exploration session for full modeling.

## Scope

- Gemini multimodal transcription endpoint
- Transcript storage (new `transcripts` table, keyed by URL)
- Credit system DB schema (replace existing quota tables)
- Credit consumption logic for all operations
- Credit balance display in UI
- Fee estimation in scrape URL discovery step
- Caption availability detection
- Content char limit increase (10K → 50K)
- Video duration cap (45 min max)

## Out of Scope

- Stripe integration / payment processing (deferred — free trial period first)
- Alternative transcription services (Whisper, Google STT)
- Video visual analysis (text transcription only)
- Changes to Gemini text analysis prompts
- Retroactive re-transcription of existing posts
