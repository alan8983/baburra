# Proposal: Fix Issues #35, #36, #37

## What

Fix three issues discovered during production usage:

1. **#35 — Noisy Tiingo timeout errors in server logs** — `enrichPostsWithPriceChanges()` logs `console.error` for every stock that times out, flooding the terminal with 14+ error lines on every posts page load. The timeout + graceful degradation is working as designed; only the log severity is wrong.

2. **#36 — Wrong `postedAt` for captionless YouTube videos** — AI analysis guesses today's date from transcript text (which has no date cues), and this incorrect guess takes priority over the correct `fetchResult.postedAt` from YouTube HTML metadata. This corrupts price change calculations and win rate accuracy.

3. **#37 — Max video transcription capped at 45 minutes** — `MAX_VIDEO_DURATION_SECONDS` rejects videos over 45 min, blocking popular KOLs like Gooaye who produce ~50-min episodes. The Gemini timeout formula already supports up to 60 min.

## Why

- **#36 is critical** — silently corrupts historical data. Every captionless YouTube video gets today's date, making all price-relative calculations wrong for those posts. This undermines the core product promise (measuring KOL prediction accuracy).
- **#35 is cosmetic but noisy** — 14+ error lines per page load obscure real errors in dev logs.
- **#37 is a coverage gap** — prevents tracking a meaningful segment of the KOL ecosystem.

## Scope

### #35: Downgrade enrichPriceChanges log severity

- **File**: `src/lib/api/enrich-price-changes.ts`
- **Change**: Replace per-stock `console.error` with a single summary `console.debug` when stocks fail. Only log `console.warn` if ALL stocks fail (indicating a systemic issue).

### #36: Invert postedAt priority (metadata over AI guess)

- **File**: `src/domain/services/import-pipeline.service.ts`
- **Change**: Swap the priority so `fetchResult.postedAt` (structured metadata from extractors) wins over `analysis.postedAt` (AI guess from content). This applies globally to all platforms, not just YouTube — structured metadata is always more reliable than AI inference.

### #37: Increase max video duration to 60 minutes

- **File**: `src/domain/services/import-pipeline.service.ts`
- **Change**: Update `MAX_VIDEO_DURATION_SECONDS` from `45 * 60` to `60 * 60`. The dynamic timeout formula (`max(180s, min(600s, 60s + durationSeconds * 4))`) already caps at 600s for any video >= 135s — no formula change needed.

## Out of Scope

- Backfilling already-imported posts with wrong dates — separate investigation needed to identify affected rows and decide on re-scrape vs. SQL update.
- Tiingo API reliability improvements (caching, circuit breaker) — the 5s timeout + graceful degradation is acceptable for now.
- Posts page loading speed optimization — 5s worst-case is acceptable in current stage.
