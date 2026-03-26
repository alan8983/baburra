# Proposal: Fix Scrape Flow Credit Consumption

## What

Fix the scrape flow to actually consume credits when processing URLs. Currently, `profile-scrape.service.ts` hardcodes `quotaExempt = true` when calling `processUrl()`, meaning the scrape flow never charges credits — bypassing the entire credit system designed in the `youtube-transcript-gemini` change.

## Why

During verification testing of the credit system (tasks 4.1–4.8 from `youtube-transcript-gemini`), we discovered that scraping a captioned YouTube video (`eXINs9yPfRU`) completed successfully but the credit balance remained at 850/850. Investigation traced the root cause to `profile-scrape.service.ts:263`:

```ts
batch.map((url) => processUrl(url, userId, timezone, true, kolCache, kolId))
//                                                    ^^^^
//                                                    Always exempt!
```

This means:
- **No credits are ever consumed** during scrape jobs (the primary way users import content)
- The fee estimation UI (Phase 3) shows costs to users but never actually charges them
- The credit system is effectively non-functional for the main user workflow

### Verification Test Results (before fix)

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| 4.1 Text post (1 credit) | Balance: 849 | Blocked — no Twitter API key | Blocked |
| 4.2 YouTube w/ captions (2 credits) | Balance: 848 | Balance: 850 (no deduction) | **FAIL** |
| 4.3 Gemini transcription (7/min) | Varies | Not tested (depends on 4.2 fix) | Blocked |
| 4.4 Transcript cache | Cache hit | Not tested | Blocked |
| 4.5 Re-roll (3 credits) | Balance: -3 | Not tested yet | Pending |
| 4.6 Insufficient credits | Error shown | Not tested yet | Pending |
| 4.7 Video >45 min | Rejection msg | Not tested yet | Pending |
| 4.8 Weekly reset | Balance resets | Not tested yet | Pending |

## Scope

### Files to modify
- **`src/domain/services/profile-scrape.service.ts`** — Change `quotaExempt` from `true` to dynamically check onboarding status, matching the behavior in `importBatch()`

### Files for reference (no changes needed)
- `src/domain/services/import-pipeline.service.ts` — Already has correct credit consumption logic gated on `quotaExempt`
- `src/infrastructure/repositories/ai-usage.repository.ts` — `consumeCredits()` and `refundCredits()` RPCs work correctly

## Out of Scope

- Twitter API integration (4.1 test) — requires separate API key setup
- Gemini transcription pipeline (Phase 2, tasks 2.1–2.3) — not yet implemented; separate change
- Any UI changes — the fee estimation UI already works correctly
