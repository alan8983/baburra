# Credit Cost Breakdown (Lego Model)

Internal reference for pricing, cost estimation, and future re-balancing.

Status: **proposed** — landing via OpenSpec change
`rework-credit-cost-lego` (see `openspec/changes/rework-credit-cost-lego/`).
This doc is the product-facing reference; the spec under that change is the
normative contract.
Owner: product / eng
Last updated: 2026-04-06

## Philosophy

Instead of bundling each input type into a single flat credit price
(`text_analysis = 1`, `video_transcription_per_min = 5`, etc.), model every
import as a **composition of reusable building blocks** ("legos"). The user is
charged the sum of the blocks their request actually consumes.

Benefits:

- Transparent to users ("you used: scrape + transcribe 12min + AI analyze").
- Easy to re-price a single block when a vendor's cost changes (e.g. Deepgram
  rate hike) without touching unrelated flows.
- Makes it obvious when a flow is under-recovering cost (block price < vendor
  price).
- Profile discovery, re-rolls, batch imports all decompose into the same blocks
  — no special cases.

## Lego blocks

Each block has: a user-facing credit price, an estimated unit vendor cost, and
a note on which vendor/API point it maps to. Credit prices are **proposals**,
not current code. Current code values are listed in the "Today" column for
comparison (see `src/domain/models/user.ts` `CREDIT_COSTS`).

| Block ID | Description | Unit | Proposed credits | Today | Vendor / our $ per unit | Notes |
|---|---|---|---|---|---|---|
| `scrape.html` | Fetch + parse a single public HTML page (article, YT page, generic URL) | 1 page | 0.2 | free | ~0 (our egress only) | Cheap, but not free — prevents discovery abuse |
| `scrape.youtube_meta` | YouTube page/oEmbed metadata + caption availability check | 1 video | 0.2 | free | ~0 | Used in discovery + single import |
| `scrape.youtube_captions` | Pull existing captions via `youtube-transcript` | 1 video | 0.5 | bundled in `2` | ~0 (unofficial, rate-limit risk) | Free vendor, but reliability cost |
| `scrape.rss` | Fetch + parse an RSS/Atom feed (podcast show, YT channel) | 1 feed | 0.3 | free | ~0 | |
| `scrape.apify.profile` | Apify actor run listing posts for a profile (FB/X/Threads/TikTok) | 1 profile run | 2.0 | free (!) | **$0.05–$0.30** per run | Discovery currently free — biggest leak |
| `scrape.apify.post` | Apify actor — single post / item payload | 1 item | 0.5 | bundled in `1` | **~$0.002–$0.01** per item | Scales linearly in batch imports |
| `download.audio.short` | yt-dlp / podcast MP3 download ≤ 60s | 1 file | 0.3 | bundled | egress + temp disk | |
| `download.audio.long` | yt-dlp / podcast MP3 download > 60s | per minute | 0.1 / min | bundled | egress + temp disk | |
| `transcribe.audio` | Audio STT (any length). Deepgram primary, Gemini audio failover. | per minute | 1.5 / min | bundled in `5/min` | **~$0.0043 / min** (Deepgram nova-2) | Single user-facing block; vendor routing is internal |
| `transcribe.cached_transcript` | Use a transcript we already have (podcast:transcript, YT captions) | 1 doc | 0.2 | bundled | ~0 | |
| `ai.analyze.short` | Gemini sentiment/argument analysis on ≤ 2k tokens | 1 call | 1.0 | `1` | Gemini input+output tokens | Covers text posts, article, short video |
| `ai.analyze.long` | Gemini analyze on > 2k tokens (long video / podcast transcript) | per 2k tokens | 1.0 / 2k tok | flat `2` or `5/min` | Gemini tokens | Prevents long transcripts from under-paying |
| `ai.reroll` | Re-run analysis on cached text, no re-fetch | 1 call | 2.0 | `3` | Gemini tokens | Discount vs. fresh import |
| `stock.price_lookup` | Tiingo price/K-line fetch for a symbol | 1 symbol / day range | 0 | free | flat monthly sub | Not metered to users |

### Vendor-cost-to-credit reference

A credit should target **~2–3× our marginal vendor cost** to cover Gemini +
Apify + Supabase overhead and leave margin. Rough anchor: **1 credit ≈
US$0.002** of delivered value. That gives:

- Deepgram minute (~$0.0043) → ~2 credits before margin → **1.5** after
  acknowledging we bundle analysis separately.
- Apify profile run (~$0.10 mid) → ~50 credits raw. We soften to **2** because
  discovery should feel cheap; the real revenue comes from per-post blocks.
- Gemini short analyze (~$0.0005–$0.001) → ~1 credit.

These numbers are placeholders — needs a real benchmark pass against each
vendor's current pricing.

## Recipes — composing blocks per input type

All examples assume the lego prices above.

### Single-URL imports

| Input | Recipe | Credits | Today |
|---|---|---|---|
| **Text article / generic URL** | `scrape.html` + `ai.analyze.short` | 1.2 | 1 |
| **Twitter/X post** (user pastes URL) | `scrape.apify.post` + `ai.analyze.short` | 1.5 | 1 |
| **Facebook post** | `scrape.apify.post` + `ai.analyze.short` | 1.5 | 1 |
| **Threads post** | `scrape.apify.post` + `ai.analyze.short` | 1.5 | 1 |
| **YouTube — has captions** | `scrape.youtube_meta` + `scrape.youtube_captions` + `ai.analyze.long × ⌈tokens/2k⌉` | ~1.7 + analyze | 2 |
| **YouTube Short, no captions** | `scrape.youtube_meta` + `download.audio.short` + `transcribe.audio × 1` + `ai.analyze.short` | ~3.5 | 3 |
| **YouTube long video, no captions** | `scrape.youtube_meta` + `download.audio.long × min` + `transcribe.audio × min` + `ai.analyze.long × ⌈tokens/2k⌉` | 0.2 + 1.6·min + analyze | 5·min |
| **Podcast episode — has `<podcast:transcript>`** | `scrape.rss` + `transcribe.cached_transcript` + `ai.analyze.long × ⌈tokens/2k⌉` | ~0.5 + analyze | 2 |
| **Podcast episode — no transcript** | `scrape.rss` + `download.audio.long × min` + `transcribe.audio × min` + `ai.analyze.long × ⌈tokens/2k⌉` | 0.3 + 1.6·min + analyze | 5·min |
| **TikTok — caption only** | `scrape.apify.post` + `ai.analyze.short` | 1.5 | 1 |
| **TikTok — needs transcription** | `scrape.apify.post` + `download.audio.short` + `transcribe.audio × ⌈min⌉` + `ai.analyze.short` | ~3.8 | 5·min |
| **Re-roll existing post** | `ai.reroll` | 2 | 3 |

### Profile / batch imports

Profile scrapes decompose into **discovery** (one-time per run) plus **per-item**
blocks. Discovery is no longer free.

| Profile | Discovery recipe | Per item recipe | Example: 20 items |
|---|---|---|---|
| **YouTube channel** | `scrape.rss` or `scrape.youtube_meta × N` for listing | per video recipe above | varies by caption/length |
| **YouTube Shorts coverage** | `scrape.youtube_meta × N` | Short recipe | ~70 credits |
| **Podcast show** | `scrape.rss` | podcast single-ep recipe | varies heavily |
| **Facebook profile** | `scrape.apify.profile` | `scrape.apify.post` + `ai.analyze.short` | 2 + 20 × 1.5 = **32** |
| **Twitter/X profile** | `scrape.apify.profile` | same as FB | **32** |
| **Threads profile** | `scrape.apify.profile` | same | **32** |
| **TikTok profile** | `scrape.apify.profile` | caption or transcribe recipe | 2 + mixed |

Under today's flat model, a 20-post FB profile scrape = 20 credits but
potentially **$0.10–$0.30** of Apify spend. Under the lego model it's 32
credits and every profile discovery pays for its own actor run.

## Cost / API points to watch

1. **Apify** — biggest leak today. Discovery should stop being free. Per-item
   block price must exceed Apify per-result cost.
2. **Deepgram is the single primary transcription vendor** for all
   captionless audio regardless of clip length — predictable per-minute cost
   and consistently cheaper than Gemini audio for anything ≥2–3 minutes.
   Gemini audio remains as a **failover only** path (Deepgram 5xx, rate
   limit, unsupported language); it is not a separate user-facing block.
   The single `transcribe.audio` block insulates users from vendor routing
   so we can swap or rebalance later without a price change.
3. **Gemini analyze on long transcripts** — flat `2` for podcast transcript
   analysis under-recovers for 2-hour episodes with 40k+ tokens. Per-2k-token
   pricing fixes this.
4. **yt-dlp reliability / bans** — not a $ cost but a downtime risk. No credit
   lever, but worth a separate infra budget.
5. **Tiingo** — flat sub, not metered. Safe to keep out of credits.
6. **Supabase storage/egress** — add a `storage.cache` block later if we start
   persisting audio or transcripts beyond a TTL.

## Open questions

- Should discovery blocks be **charged up-front** (before the user confirms
  imports) or **rolled into** each imported item? Up-front matches our cost
  reality; rolling in is friendlier UX. Suggest: charge up-front but refund
  unused portion if 0 items imported.
- Do we expose block-level itemisation to users, or only show the total?
  Recommend: total in the main UI, itemised breakdown in a tooltip / usage
  page.
- Re-roll pricing should probably scale with the original transcript size
  (same `ai.analyze.long` recipe), not a flat discount.
- How do we handle **failed imports**? Current code refunds on failure; lego
  model should refund only the blocks that didn't run (e.g. if transcription
  succeeded but analyze failed, refund `ai.analyze.*` only).

## Next steps

1. Benchmark actual vendor costs per block (Apify runs, Deepgram minutes,
   Gemini token costs for typical transcripts). **Pending** — needed to
   validate / tune the block prices above before merge.
2. Lock block prices with a margin target (suggest 2–3× vendor cost).
   **Tracked in** `openspec/changes/rework-credit-cost-lego/tasks.md`.
3. Refactor `CREDIT_COSTS` into block constants + `composeCost(recipe)`.
   **Proposed** in `openspec/changes/rework-credit-cost-lego/` — run
   `/opsx:apply rework-credit-cost-lego` to implement.
4. Update the pricing page and weekly-credit tier allocations if the lego
   model meaningfully changes typical-user spend. **Follow-up change** — out
   of scope for `rework-credit-cost-lego`.

## Implementation reference (post-apply)

Once `rework-credit-cost-lego` is applied, the canonical code locations will
be:

- `src/domain/models/credit-blocks.ts` — `CREDIT_BLOCKS`, `BlockId`, `Recipe`,
  `composeCost`.
- `src/domain/models/user.ts` — `CREDIT_COSTS` kept as a `@deprecated` shim
  derived from `composeCost` for one release.
- Each extractor in `src/infrastructure/extractors/` returns a `recipe` field
  alongside `estimatedCreditCost`.
- `src/domain/services/import-pipeline.service.ts` and
  `profile-scrape.service.ts` charge via `composeCost(recipe)` only.
