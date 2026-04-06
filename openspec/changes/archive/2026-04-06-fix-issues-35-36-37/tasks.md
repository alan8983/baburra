# Tasks: Fix Issues #35, #36, #37

## #37: Increase max video duration (trivial)

- [x] Update `MAX_VIDEO_DURATION_SECONDS` from `45 * 60` to `60 * 60` in `src/domain/services/import-pipeline.service.ts:41`

## #36: Invert postedAt priority (critical)

- [x] Swap priority in `src/domain/services/import-pipeline.service.ts:428-432`: `fetchResult.postedAt` first, `analysis.postedAt` second, `new Date()` third
- [x] Update or add unit test in `src/domain/services/__tests__/import-pipeline.service.test.ts` to verify extractor date wins over AI date when both are present
- [x] Add unit test for fallback: AI date used when extractor date is null

## #35: Downgrade enrichPriceChanges log severity (cosmetic)

- [x] Replace per-stock `console.error` with aggregated logging in `src/lib/api/enrich-price-changes.ts`: `console.warn` when all fail, `console.debug` when some fail, silent on success
- [x] Remove the individual error log line inside the for-loop (line 50)

## Verification

- [x] Run `npm test` — all existing tests pass (631/631)
- [x] Run `npm run type-check` — no type errors
