## Why

`post_stocks.sentiment` is `NULL` for **618 of 704** rows (87.8%) across the production database, including 36 of 37 Gooaye+NVDA rows. The per-stock win-rate calculator excludes every `NULL`-sentiment sample, so almost every KOL detail page renders the per-stock 報酬率統計 card as dashes (5日/30日/90日/365日 all `—`, `0+/0-`). The feature is effectively dark for 88% of the data even though the post-level sentiment (used by the chart markers and post card previews) is populated. This was discovered during browser validation of PR #77 and is not caused by it — the NULLs predate that change.

## What Changes

- Backfill `post_stocks.sentiment` for rows where it is currently `NULL`, using the existing AI sentiment pipeline applied at the (post, stock) grain.
- Apply the same per-stock sentiment pass to future ingests so the gap does not re-open. The post-creation pipeline must set per-stock sentiment synchronously (same pipeline step, same API call) rather than relying on a separate backfill job.
- Decide and document the classifier's handling of `NULL` per-stock sentiment for safety: should `NULL` fall back to `posts.sentiment` for single-stock posts, or continue to be treated as excluded? Design doc settles this — lean toward continued-exclude to keep metrics conservative, but make it an explicit documented policy.

## Capabilities

### New Capabilities
<!-- none — this reuses the existing AI pipeline capability -->

### Modified Capabilities
- `ai-pipeline`: the per-post AI sentiment step must also emit a per-stock sentiment for every (post, stock) pair it attaches. Currently per-stock sentiment is only written when the AI explicitly dissents from the post-level sentiment for a specific ticker; this proposal changes it to always write the per-stock value (equal to post-level when no ticker-specific divergence).

## Impact

- **Code**: `src/domain/services/ai.service.ts` (per-stock sentiment emission), `src/domain/calculators/win-rate.calculator.ts` (documented NULL policy).
- **Data**: one-shot backfill of ~618 `post_stocks.sentiment` rows via a script using the same AI path as live ingest. Sequential to stay inside Gemini rate limits.
- **APIs**: no contract change. `/api/kols/*/win-rate` response shape is unchanged; the `bucketsByStock[stockId]` entries will start returning non-dash values for previously-excluded-due-to-NULL pairs.
- **Dependencies**: Gemini (existing). No new external deps.
- **Not affected**: post-level sentiment, chart markers, post card previews, KOL-level scorecard cache (already uses `posts.sentiment` fallback indirectly). The rollout of `rollout-scorecard-cache-prod` is independent of this work.
