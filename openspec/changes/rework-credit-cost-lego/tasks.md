## 1. Domain layer: block catalogue and helper

- [ ] 1.1 Create `src/domain/models/credit-blocks.ts` with `BlockId` union, `CreditBlock` type (`{ credits, unit }`), `CREDIT_BLOCKS` constant matching the prices in `docs/CREDIT_COST_BREAKDOWN.md`, `Recipe` type (`Array<{ block: BlockId, units: number }>`), and `composeCost(recipe): number` helper.
- [ ] 1.2 Unit tests `src/domain/models/credit-blocks.test.ts`: per-block price sanity, empty recipe = 0, additive composition, fractional blocks round up to nearest integer at final total only.
- [ ] 1.3 Add `@deprecated` JSDoc to `CREDIT_COSTS` in `src/domain/models/user.ts` and rewrite its values to be derived from `composeCost` on the canonical recipes (`text_analysis`, `youtube_caption_analysis`, `video_transcription_per_min`, `short_transcription`, `reroll_analysis`, `podcast_transcript_analysis`). Verify no numeric change larger than ±1 for single-unit cases; document any deltas in the PR.

## 2. Extractor refactor: return recipes

- [ ] 2.1 Extend `ExtractorResult` / discovery result types in `src/infrastructure/extractors/types.ts` with an optional `recipe: Recipe` field. Keep `estimatedCreditCost: number` computed from the recipe.
- [ ] 2.2 `youtube.extractor.ts` — `checkCaptionAvailability` and full-import paths produce a recipe: `scrape.youtube_meta` always, plus `scrape.youtube_captions` | `download.audio.short + transcribe.gemini_audio` | `download.audio.long + transcribe.deepgram` based on branch, plus `ai.analyze.short` or `ai.analyze.long × ⌈tokens/2k⌉`.
- [ ] 2.3 `youtube-channel.extractor.ts` — discovery recipe charges `scrape.rss` (or `scrape.youtube_meta × N` if we list via HTML), then per-video recipes from 2.2.
- [ ] 2.4 `podcast.extractor.ts` + `podcast-profile.extractor.ts` — discovery charges `scrape.rss`; per-episode recipe uses `transcribe.cached_transcript` if `<podcast:transcript>` exists else `download.audio.long + transcribe.deepgram`, plus `ai.analyze.long × ⌈tokens/2k⌉`.
- [ ] 2.5 `facebook.extractor.ts` + `facebook-profile.extractor.ts` — single post = `scrape.apify.post + ai.analyze.short`. Profile discovery = `scrape.apify.profile` (up-front charge) + per-item `scrape.apify.post + ai.analyze.short`.
- [ ] 2.6 `twitter.extractor.ts` + `twitter-profile.extractor.ts` — same pattern as Facebook.
- [ ] 2.7 `threads.extractor.ts` — same pattern as Facebook (no separate profile extractor file today; handle if present, otherwise inline).
- [ ] 2.8 `tiktok.extractor.ts` + `tiktok-profile.extractor.ts` — caption branch = `scrape.apify.post + ai.analyze.short`; transcribe branch = `scrape.apify.post + download.audio.short + transcribe.gemini_audio × min + ai.analyze.short`.
- [ ] 2.9 Generic HTML / article extractor (if a dedicated one exists; otherwise update the import pipeline's inline fetch) — recipe `scrape.html + ai.analyze.short`.

## 3. Pipeline and API routes

- [ ] 3.1 `src/domain/services/import-pipeline.service.ts` — replace direct `CREDIT_COSTS` lookups with extractor-provided recipes. All charges go through `composeCost`. Refund-on-failure behaviour preserved.
- [ ] 3.2 `src/domain/services/profile-scrape.service.ts` — charge `scrape.apify.profile` up-front before triggering the Apify actor for FB/X/Threads/TikTok profiles. No charge for RSS-based discovery beyond `scrape.rss`.
- [ ] 3.3 `src/app/api/ai/analyze/route.ts` — re-roll charge switches from `CREDIT_COSTS.reroll_analysis` to `composeCost([{ block: 'ai.reroll', units: 1 }])`.
- [ ] 3.4 Any other API route that reads `CREDIT_COSTS` directly — migrate to `composeCost` with an explicit recipe.

## 4. UI call sites

- [ ] 4.1 `src/components/import/import-form.tsx` — compute estimate from extractor recipe (still display a single total for this change).
- [ ] 4.2 `src/components/scrape/url-discovery-list.tsx` — read `estimatedCreditCost` from recipe (no UI change).
- [ ] 4.3 `src/app/(app)/input/page.tsx` — same.
- [ ] 4.4 Visual regression pass: no credit number shown in the UI should change by more than 20% for a representative input of each type; log deltas in the PR description.

## 5. Tests

- [ ] 5.1 Add recipe snapshot tests for each extractor in `src/infrastructure/extractors/__tests__/` — one representative URL per input type, asserting the exact recipe returned.
- [ ] 5.2 Update `src/infrastructure/repositories/__tests__/ai-usage.repository.test.ts` for any numeric credit assertions that shift.
- [ ] 5.3 Update `src/infrastructure/extractors/__tests__/podcast-profile.extractor.test.ts` for the new `transcribe.cached_transcript` path.
- [ ] 5.4 Pipeline integration test: import a mock FB post end-to-end and assert `credit_balance` decrements by `composeCost(expectedRecipe)`.
- [ ] 5.5 Profile-scrape test: assert `scrape.apify.profile` is charged up-front and NOT refunded when 0 items are imported.
- [ ] 5.6 Run `npm run type-check` and `npm run test` clean.

## 6. Spec and docs

- [ ] 6.1 Write `openspec/changes/rework-credit-cost-lego/specs/credit-cost/spec.md` with `## ADDED Requirements` for the block catalogue, `composeCost` helper, extractor recipe contract, and Apify discovery charging rule.
- [ ] 6.2 Update `openspec/specs/data-models/spec.md` if it references `CREDIT_COSTS` directly — point to `CREDIT_BLOCKS`.
- [ ] 6.3 Update `openspec/specs/ai-pipeline/spec.md` to mention recipes as the cost contract between extractors and the pipeline.
- [ ] 6.4 Update `docs/CREDIT_COST_BREAKDOWN.md`:
  - Mark the "Next steps" section items 2 and 3 as done.
  - Add an "Implementation" section linking to `src/domain/models/credit-blocks.ts` and calling out the deprecation of `CREDIT_COSTS`.
  - Lock the block price table (remove the "proposed" caveat).
- [ ] 6.5 Add a short entry to `docs/BACKLOG.md` noting the lego credit system shipped (if a "Completed" section exists).

## 7. Rollout checks

- [ ] 7.1 Run `npm run lint && npm run type-check && npm test` clean.
- [ ] 7.2 Manually exercise one import per input type on local dev and confirm credit deduction matches the recipe.
- [ ] 7.3 Archive the change with `/opsx:archive rework-credit-cost-lego` once merged.
