## Why

Once `rework-credit-cost-lego` ships, Deepgram is the primary transcription vendor for all captionless audio. Transcription accuracy on Baburra-specific terms — US/TW ticker symbols, KOL channel names, and zh-TW financial jargon (殖利率, 權證, 融資餘額, 當沖, 三大法人, etc.) — directly affects every downstream Gemini analysis: a misheard ticker becomes a missed prediction, which hurts win-rate scoring.

Deepgram nova-2 supports a `keywords` parameter that boosts recognition probability for a supplied vocabulary list. Building and maintaining this list is the highest-leverage accuracy improvement we can ship without changing vendors or pipelines.

Note: keyword boosting is a Growth-plan Deepgram feature. This change is gated on moving the Deepgram account off Pay-As-You-Go.

## What Changes

- **Keyword catalogue** — a versioned `src/domain/services/transcription-keywords.ts` exporting three lists: `tickers` (US + TW), `kolNames` (sourced from the existing `kols` table), `financialJargonZhTw` (curated). Each entry has an optional weight (1.0–10.0; default 2.0).
- **Dynamic KOL keyword injection** — when the transcription service is invoked for a clip whose `kol_id` is known, the relevant KOL's display name and aliases are injected into the per-request keyword list. Keeps the static catalogue stable while still personalising per-request.
- **Deepgram client wiring** — pass `keywords` as a query param on the `listen` call, formatted per Deepgram spec (`keyword:weight`).
- **Migration / data sourcing** — tickers come from the existing stocks table. Jargon list seeded from a curated `.txt` checked into the repo, reviewable in PR.
- **Telemetry** — log the size of the keyword list per request and the resulting Deepgram word-error-rate sample (when available) to track impact.
- **Plan upgrade prerequisite** — operational task (not code) to move Deepgram account to Growth before enabling. Code path is feature-flagged off until then.

## Capabilities

### New Capabilities
- `transcription-accuracy`: Domain-vocabulary boosting for Deepgram transcription, with static catalogues (tickers, jargon) and dynamic per-request injection (KOL names).

## Impact

- **Domain services**: New `src/domain/services/transcription-keywords.ts`. Modified `transcribeAudio` (the routing service introduced by `rework-credit-cost-lego`) to accept and forward keywords.
- **Infrastructure**: Deepgram client wrapper updated to pass `keywords` param.
- **Data**: New `src/domain/services/keywords/zh-tw-financial.txt` (curated list, ~200–500 entries). Tickers pulled from `stocks` table at request time, cached in-memory.
- **Tests**: Unit tests for keyword formatting (`keyword:weight` syntax), per-request injection of KOL names, and ticker lookup.
- **Ops**: Move Deepgram account to Growth plan; document plan tier in `docs/INFRA.md` (or equivalent). Add `DEEPGRAM_KEYWORD_BOOST_ENABLED` env flag.
- **No DB migration.** Reads from existing `stocks` and `kols` tables.
- **Depends on:** `rework-credit-cost-lego` (uses the `transcribeAudio` routing service).
