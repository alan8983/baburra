## Why

The `fix-scrape-credit-consumption` change fixed the core bug (hardcoded `quotaExempt = true`), and 6/8 verification tests passed. However, two critical tests remain unverified:

- **Gemini transcription credit consumption** (7 credits/min for captionless videos)
- **Transcript caching** (re-scrape same URL → no additional credits)

These were previously blocked because Gemini API returned "fetch failed" in the test environment. The blockers are now resolved — Gemini API key is configured and accessible. This follow-up completes the credit system verification end-to-end.

### What was verified (in `fix-scrape-credit-consumption`)

| Test | Result |
|------|--------|
| Captioned YouTube video → 2 credits consumed | Pass |
| Re-roll analysis → 3 credits consumed | Pass |
| Insufficient credits → error shown | Pass |
| Video >45 min → rejected, 0 credits | Pass |
| Weekly credit reset | Pass |

### What remains unverified

| Test | What it proves |
|------|---------------|
| Captionless YouTube video → Gemini transcription → 7 credits/min | The most expensive credit path actually works |
| Re-scrape same URL → transcript cache hit → 2 credits (not 7/min) | Caching prevents double-charging users |

## What Changes

**No code changes.** This is a verification-only change that:

1. Runs the two remaining credit verification tests via real Gemini API calls
2. Verifies data integrity by querying Supabase directly (transcripts table, ai_usage balance)
3. Tests the full user golden journey via Preview tool (paste URL → discover → scrape → verify credits deducted → verify transcript stored)

## Capabilities

### New Capabilities
_(none — verification only)_

### Modified Capabilities
_(none — verification only)_

## Impact

- Zero code changes
- Validates the credit system's most expensive path (Gemini transcription)
- Validates the transcript caching mechanism prevents double-charging
- Produces a comprehensive verification report with Supabase evidence
