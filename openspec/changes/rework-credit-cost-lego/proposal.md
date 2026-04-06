## Why

Baburra's current credit model (`src/domain/models/user.ts` `CREDIT_COSTS`) is a
flat lookup — `text_analysis = 1`, `video_transcription_per_min = 5`,
`podcast_transcript_analysis = 2`, etc. Each input type maps to one number, and
the steps that actually happen inside an import (scrape, download, transcribe,
analyze) are hidden inside that number.

This has three concrete problems:

1. **Profile discovery is free.** A Facebook / X / Threads / TikTok profile
   scrape spends real money on Apify actor runs before the user imports
   anything. Users pay 0 credits for discovery. One curious user can burn
   meaningful $ on our side.
2. **Long transcripts under-recover.** A 2-hour podcast with an existing
   transcript is flat `2` credits, but the Gemini analysis call on 40k+ tokens
   costs much more than a 1k-token article analysis also priced at `1`.
3. **Vendor re-pricing is scattered.** If Deepgram raises its per-minute rate,
   or we switch a path from Gemini audio to Deepgram, every flat constant
   bundling those costs has to be re-derived. There is no single place to
   adjust one vendor lever.

The `docs/CREDIT_COST_BREAKDOWN.md` document already describes a "lego"
alternative: model every import as a composition of reusable blocks (scrape,
download, transcribe, analyze), each priced against its marginal vendor cost.
This change lands that model in code.

## What Changes

- **New block catalogue (`CREDIT_BLOCKS`)** — typed constant mapping block IDs
  (`scrape.html`, `scrape.youtube_meta`, `scrape.apify.profile`,
  `scrape.apify.post`, `download.audio.short`, `download.audio.long`,
  `transcribe.audio`, `transcribe.cached_transcript`,
  `ai.analyze.short`, `ai.analyze.long`, `ai.reroll`) to unit credit prices.
- **Single transcription block.** All captionless audio transcription
  (Shorts, long video, podcasts without `<podcast:transcript>`) routes through
  one user-facing block `transcribe.audio` priced at `1.5` credits per minute.
  Internally, **Deepgram is the primary vendor** (predictable per-minute cost,
  cheaper than Gemini audio for anything ≥2–3 minutes, simpler routing).
  Gemini audio remains available as a **failover-only** path (Deepgram 5xx,
  rate-limited, unsupported language) — it is not user-visible and is not its
  own credit block.
- **Recipe helper (`composeCost`)** — pure function taking a list of `{ block,
  units }` items and returning total credits. All cost estimates flow through
  this helper.
- **Extractor refactor** — YouTube, podcast, Facebook, Twitter, Threads,
  TikTok, and article extractors return a **recipe** (list of blocks) instead
  of a flat `estimatedCreditCost`. The existing `estimatedCreditCost` field is
  derived from the recipe for backwards compat.
- **Import pipeline refactor** — `import-pipeline.service.ts` and
  `profile-scrape.service.ts` build and charge recipes rather than picking a
  single `CREDIT_COSTS` entry.
- **Apify profile discovery becomes billable.** Profile scrape discovery runs
  charge the `scrape.apify.profile` block up-front. If the user imports zero
  items from the discovery result, the discovery charge is **not** refunded
  (it reflects real Apify spend). A follow-up change can add partial refunds
  if needed.
- **Deprecate `CREDIT_COSTS`.** Old constant is kept as a thin re-export
  mapping to block totals for one release, then removed.
- **Doc update.** `docs/CREDIT_COST_BREAKDOWN.md` is updated to mark the lego
  model as implemented, with a link to the new constants and helper, and to
  record the final locked prices.
- **No tier limit changes.** Weekly credit allocations per tier
  (free/pro/max = 700/4200/21000) stay the same for this change. A follow-up
  proposal can re-tune them once we have real usage data under the lego
  model.

## Capabilities

### New Capabilities
- `credit-cost`: Block catalogue, recipe composition helper, and the rule
  that every charged action in the import pipeline must flow through a
  recipe.

### Modified Capabilities
- `data-models`: `CREDIT_COSTS` is deprecated; `CREDIT_BLOCKS` is the new
  source of truth for credit pricing.
- `ai-pipeline`: Extractors and the import pipeline charge per-block instead
  of per-flat-cost.

## Impact

- **Domain models**: New `src/domain/models/credit-blocks.ts` with
  `CREDIT_BLOCKS`, `BlockId`, `Recipe`, `composeCost`. `user.ts` `CREDIT_COSTS`
  becomes a derived deprecated alias.
- **Extractors**: `youtube.extractor.ts`, `youtube-channel.extractor.ts`,
  `podcast.extractor.ts`, `podcast-profile.extractor.ts`,
  `facebook.extractor.ts`, `facebook-profile.extractor.ts`,
  `twitter.extractor.ts`, `twitter-profile.extractor.ts`,
  `threads.extractor.ts`, `tiktok.extractor.ts`,
  `tiktok-profile.extractor.ts` — return recipes.
- **Services**: `import-pipeline.service.ts`, `profile-scrape.service.ts` —
  consume recipes; AI re-analysis route charges `ai.reroll`.
- **API routes**: `/api/ai/analyze`, `/api/scrape/*`, `/api/import/*` — cost
  estimation and charging via `composeCost`.
- **Components**: `import-form.tsx`, `url-discovery-list.tsx`,
  `(app)/input/page.tsx` — read recipe totals from extractor output; no UI
  copy changes required for this change (itemised breakdown is a follow-up).
- **Tests**: New unit tests for `composeCost` and per-extractor recipe
  shape; update existing cost assertions in
  `ai-usage.repository.test.ts`, `podcast-profile.extractor.test.ts`, and
  import pipeline tests.
- **Docs**: `docs/CREDIT_COST_BREAKDOWN.md` updated to reflect "implemented"
  status and the locked block prices.
- **No DB migration.** `profiles.credit_balance` and `credit_reset_at` are
  unchanged. Tier limits unchanged.
