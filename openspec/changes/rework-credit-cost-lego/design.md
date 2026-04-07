## Context

Current pricing lives in `src/domain/models/user.ts`:

```ts
export const CREDIT_COSTS = {
  text_analysis: 1,
  youtube_caption_analysis: 2,
  video_transcription_per_min: 5,
  short_transcription: 3,
  reroll_analysis: 3,
  podcast_transcript_analysis: 2,
} as const;
```

Every extractor imports this constant and returns a single
`estimatedCreditCost` number. The import pipeline charges that number.
Discovery runs (Apify profile scrapes) don't charge at all.

`docs/CREDIT_COST_BREAKDOWN.md` already defines the lego block catalogue and
per-input-type recipes. This design pins how that doc lands in code.

## Goals / Non-Goals

**Goals:**
- Single source of truth for per-block credit prices.
- All charging paths flow through one `composeCost(recipe)` helper.
- Extractors expose a recipe (structured) in addition to the total (derived).
- Apify profile discovery is billable.
- Zero behavioural change for users whose imports already succeeded — total
  credits charged for a typical single-URL import should land within ±20% of
  today's number.

**Non-Goals:**
- Payment / Stripe integration.
- Re-tuning weekly credit allocations per tier.
- UI changes to show per-block breakdown (tooltip, usage page). Follow-up.
- Partial refunds on failed imports beyond what we already do.
- Caching `scrape.youtube_meta` results (future optimisation).
- Server-side rate-limiting of discovery.

## Decisions

### D1: Blocks live in a new file, not in `user.ts`

**Decision:** New `src/domain/models/credit-blocks.ts` exports
`CREDIT_BLOCKS`, `BlockId`, `Recipe`, and `composeCost`. `user.ts` re-exports
a `CREDIT_COSTS` shim derived from blocks for one release cycle.

**Rationale:** `user.ts` is the user-profile model. Credit pricing is its own
concern and will grow (caching, storage blocks, vendor routing). Keep it
separate from day one.

### D2: Block price as `number` of credits, units as `number`

**Decision:** Each block entry is `{ credits: number, unit: 'fixed' | 'per_minute' | 'per_2k_tokens' | 'per_item' }`. A recipe item is `{ block: BlockId, units: number }`. `composeCost` = sum of `block.credits × item.units`, rounded up to the nearest 0.1 credit then up to integer at charge time.

**Rationale:** Keeps the catalogue flat and declarative. `unit` exists for
display/tooling, not math. Fractional internal math with integer charging
avoids under-billing on 0.2-credit blocks.

### D3: Extractors return `{ estimatedCreditCost, recipe }`

**Decision:** Add a `recipe: Recipe` field to the extractor result type.
Keep `estimatedCreditCost` for backwards compat, computed as
`Math.ceil(composeCost(recipe))`.

**Rationale:** Non-breaking for callers that still read the number. New
callers can read the recipe for itemisation.

### D4: `composeCost` is a pure function, no React / DB deps

**Decision:** Pure function in the domain layer, fully unit-testable.

**Rationale:** Standard domain service pattern — mirrors the existing
calculators in `src/domain/calculators/`.

### D5: Apify profile discovery charges up-front, no auto-refund

**Decision:** `profile-scrape.service.ts` charges `scrape.apify.profile` (2
credits) before kicking off the actor run. If the user imports 0 items from
the result, the 2 credits are **not** refunded — they reflect real Apify
spend.

**Rationale:** Refunding would re-open the free-discovery abuse vector. 2
credits is cheap enough that users won't feel gouged, and it matches our
actual cost.

**Alternative considered:** Refund on 0 items. Rejected — a user could
repeatedly discover and never import.

### D6: Long analyze priced per 2k tokens

**Decision:** `ai.analyze.long` is `1.0` credit per 2k tokens (rounded up).
Extractors that produce transcripts estimate token count as
`Math.ceil(charCount / 4)` (standard approximation) to build the recipe.

**Rationale:** Caps the under-recovery on long podcasts. 2k tokens is the
cutoff between `ai.analyze.short` (flat 1) and `ai.analyze.long` — at
exactly 2k tokens, both produce 1 credit.

### D7: Single `transcribe.audio` block, Deepgram primary, Gemini failover

**Decision:** Collapse transcription into a single user-facing block
`transcribe.audio` priced at `1.5` credits per minute. Vendor selection is an
internal routing detail of the transcription service: **Deepgram is the
primary path** for all captionless audio regardless of length; **Gemini audio
is a failover** invoked only when Deepgram errors out, is rate-limited, or
returns unsupported-language. The failover path is not exposed to users and
does not have its own credit price — the user is always charged
`transcribe.audio` regardless of which vendor actually ran.

**Rationale:**
- Deepgram is consistently cheaper than Gemini audio for anything ≥2–3 minutes
  (~$0.0043/min nova-2 vs. token-priced Gemini audio that scales badly with
  length). For Shorts the two are roughly tied; the simplification is worth
  the small loss.
- Predictable per-minute cost makes the lego model honest — one formula, no
  "long analyze inflates unexpectedly" surprises.
- One block in the catalogue is simpler for users (single line on the
  itemised breakdown) and lets us swap vendors later without a pricing
  change or a spec revision.
- Keeping Gemini audio as failover preserves availability without polluting
  the price catalogue.

**Alternative considered:** Two separate blocks (`transcribe.deepgram` and
`transcribe.gemini_audio`) with extractor-level routing. Rejected because
vendor choice is an infrastructure concern, not a product concern, and
exposing it as two prices forces every recipe consumer to know about the
routing rules.

### D8: `CREDIT_COSTS` stays as a deprecated shim for one release

**Decision:** `user.ts` exports a `CREDIT_COSTS` object computed from
`CREDIT_BLOCKS` totals for the common recipes
(`text_analysis = composeCost([{block: 'ai.analyze.short', units: 1}])`,
etc.). Mark with `@deprecated` JSDoc.

**Rationale:** Minimises churn across call sites inside this change. A
follow-up change removes the shim.

## Risks / Trade-offs

**[Risk] Recipe drift between extractors and the helper** — if one extractor
forgets to include `scrape.apify.post`, it under-charges silently. Mitigation:
snapshot tests per extractor asserting the full recipe for a representative
URL.

**[Risk] Total-credit delta for existing flows** — some input types will
shift price (e.g. long podcasts up, Shorts roughly flat). Mitigation: the
proposal caps acceptable delta at ±20% for typical single-URL imports;
anything outside that gets called out in tasks for explicit sign-off.

**[Trade-off] No UI breakdown in this change** — users see a new total but
no explanation of "why". Acceptable because the current UI already shows a
single number; no regression. Itemisation is a follow-up.

**[Risk] Apify discovery charge breaks existing free-tier discovery UX** —
free users have 700 weekly credits; 2 credits per discovery is <0.3% of
weekly budget and should be invisible in practice. Still worth a QA pass
before rollout.

**[Risk] Token-count estimation is approximate** — `charCount / 4` isn't
exact for CJK text, which Baburra handles heavily (zh-TW users). Mitigation:
use `charCount / 2` for CJK-dominant text, or accept the approximation and
iterate.

## Out of scope (tracked separately)

The Deepgram-everywhere decision surfaced two narrow follow-ups that are
**not** part of this change. Each is a small, isolated fix worth its own
proposal so this change stays focused on the credit model.

1. **Podcast duration probe for feeds missing `<itunes:duration>`.** Today
   `podcast-profile.extractor.estimateCreditCost` falls back to a fixed
   "assume 30 minutes" when an RSS feed omits or mis-formats the duration tag.
   Under all-Deepgram pricing the discovery quote shown to the user comes
   directly from this estimate, so a wrong fallback turns into a real billing
   surprise on the small set of feeds that lack the tag. Fix: send a HEAD
   request to the audio enclosure URL during discovery, divide
   `Content-Length` by an assumed bitrate (~128 kbps) for a duration
   estimate. If even that fails, refuse to auto-quote and surface a "unknown
   duration — confirm to import up to N credits cap" UI affordance instead
   of guessing. **Track as a separate proposal**: `podcast-duration-probe`.

2. **Deepgram keyword boosting for tickers and KOL names.** Deepgram nova-2
   accepts a keyword list that materially improves recognition on
   domain-specific terms — exactly the surface area where transcription
   matters most for Baburra (US/TW ticker symbols, KOL channel names,
   zh-TW financial jargon like 殖利率 / 權證 / 融資餘額). Building and
   maintaining this list is a separate concern from the credit model and is
   gated on moving to Deepgram's Growth plan. **Track as a separate
   proposal**: `deepgram-keyword-boost`.

These are noted here so the rationale for keeping the current change scoped
is on record. Neither blocks `rework-credit-cost-lego`.

## Open Questions

- Should `composeCost` round per-block or only at the final total? (Design
  says final, revisit if we see drift.)
- When a transcription fails after partial minutes, do we charge for the
  minutes transcribed or refund fully? Current behaviour: refund on failure.
  Keep that until we have data.
- Do we log per-block charges in `ai_usage` for later analytics? Proposed:
  yes, add a `breakdown` JSONB column in a follow-up; this change only adds
  the total.
