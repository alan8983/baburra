## 1. Database + Profile Preference

- [ ] 1.1 Create migration `supabase/migrations/NNN_add_profile_default_win_rate_period.sql` adding `default_win_rate_period TEXT NOT NULL DEFAULT '30d' CHECK (default_win_rate_period IN ('5d','30d','90d','365d'))` to `profiles`
- [ ] 1.2 Apply migration with `supabase db push -p "$SUPABASE_DB_PASSWORD"` (after dry-run + user confirmation)
- [ ] 1.3 Regenerate `src/infrastructure/supabase/database.types.ts`
- [ ] 1.4 Extend `src/infrastructure/repositories/profile.repository.ts` to read/write the new field (snake_case ↔ camelCase mapping)
- [ ] 1.5 Extend `src/hooks/use-profile.ts`: add `defaultWinRatePeriod: '5d'|'30d'|'90d'|'365d'` to `ProfileData` and `UpdateProfileInput`
- [ ] 1.6 Update `src/app/api/profile/route.ts` GET + PATCH to include the field, with Zod validation

## 2. Data-Layer Cleanup (Remove `winRate` Alias)

- [ ] 2.1 Remove `winRate` field from `WinRateBucket` in `src/domain/calculators/win-rate.calculator.ts` and its TSDoc
- [ ] 2.2 Remove `winRate` population in `src/domain/services/win-rate.service.ts`
- [ ] 2.3 Update `src/domain/calculators/win-rate.calculator.test.ts` fixtures and assertions
- [ ] 2.4 Update `src/domain/services/win-rate.service.test.ts`
- [ ] 2.5 `grep -rn "\.winRate\b" src` — confirm zero remaining references outside this change's consumer migrations (Section 4)
- [ ] 2.6 `npm run type-check` — must pass before moving to Section 3

## 3. Dashboard Endpoint + Hook

- [ ] 3.1 Update the dashboard API route (`src/app/api/dashboard/route.ts` or the equivalent) to return `WinRateStats` per KOL in `kolWinRates` and `WinRateStats` for `pulseStats`, instead of single day30 buckets
- [ ] 3.2 Update `src/hooks/use-dashboard.ts`: change `KolWinRateEntry` from `{ bucket: WinRateBucket }` to `{ stats: WinRateStats }`, and `PortfolioPulseData.pulseStats` from `WinRateBucket` to `WinRateStats`
- [ ] 3.3 Verify payload size on a realistic seeded fixture (~100 KOLs) stays under 150KB

## 4. Shared UI Primitives

- [ ] 4.1 Create `src/components/shared/period-selector.tsx` — segmented control for `5d|30d|90d|365d`. Props: `value`, `onChange`, optional `className`. Uses `shadcn/ui` Tabs internally.
- [ ] 4.2 Create `src/components/shared/performance-metrics-popover.tsx` — takes a `WinRateBucket` + optional trigger slot. Renders precision, SQR (with qualitative label), avgExcessWin, avgExcessLose, threshold. Handles null fields.
- [ ] 4.3 Create `src/components/shared/insufficient-data-badge.tsx` — small badge with tooltip explaining the 10-resolved-post floor.
- [ ] 4.4 Add helper `getSqrQualitativeLabel(sqr: number | null): { key: 'excellent'|'decent'|'unstable'|'none'; threshold: number | null }` in `src/domain/calculators/win-rate.calculator.ts` (thresholds: `>1.0` excellent, `0.5–1.0` decent, `<0.5` unstable)
- [ ] 4.5 Unit tests: `period-selector.test.tsx` (click + keyboard nav), `performance-metrics-popover.test.tsx` (renders all fields, handles nulls), `insufficient-data-badge.test.tsx`

## 5. KOL Scorecard Migration

- [ ] 5.1 Update `src/app/(app)/kols/[id]/_components/kol-scorecard.tsx`: replace `day30Bucket` with state-driven bucket selection via `<PeriodSelector>`
- [ ] 5.2 Initialize selected period from `useProfile().data?.defaultWinRatePeriod ?? '30d'`
- [ ] 5.3 Bind `<WinRateRing>` `value` to `hitRate * 100` (not `winRate`)
- [ ] 5.4 Update ring `label` prop from `t('detail.scorecard.winRate')` → `t('detail.scorecard.hitRate')`
- [ ] 5.5 Add `ⓘ` icon next to the ring label; wrap in `<PerformanceMetricsPopover bucket={selectedBucket}>`
- [ ] 5.6 When `!selectedBucket.sufficientData`, pass `value={null}` to the ring and render `<InsufficientDataBadge>` below the counts
- [ ] 5.7 Counts line (`{winCount}/{totalCalls} correct · {noiseCount} noise`) renders regardless of `sufficientData`
- [ ] 5.8 Update `src/app/(app)/kols/[id]/_components/win-rate-ring.tsx` — no structural change; just ensure null + label work as expected

## 6. Dashboard — Portfolio Pulse Migration

- [ ] 6.1 Update `src/app/(app)/dashboard/_components/portfolio-pulse.tsx`: accept `pulseStats: WinRateStats` (not single bucket)
- [ ] 6.2 Add `<PeriodSelector>` in the card header; initialize from profile default
- [ ] 6.3 Bind the big number to `selectedBucket.hitRate * 100`
- [ ] 6.4 Add SQR sub-label under the number: `SQR {sqr.toFixed(2)} {qualitativeIcon}` when non-null
- [ ] 6.5 Render `—` + insufficient-data note when `!selectedBucket.sufficientData`
- [ ] 6.6 Threshold sub-label reads from `selectedBucket.threshold`

## 7. Dashboard — KOL Leaderboard Migration

- [ ] 7.1 Update `src/app/(app)/dashboard/_components/kol-leaderboard.tsx`: accept `kolWinRates: { id; name; avatarUrl; stats: WinRateStats }[]`
- [ ] 7.2 Add `<PeriodSelector>` in card header; initialize from profile default
- [ ] 7.3 Add `<Tabs>` with two triggers: `精準度 Accuracy` and `信號品質 Signal Quality`
- [ ] 7.4 Accuracy tab: `.filter(k => k.stats[period].sufficientData).sort((a,b) => (b.stats[period].hitRate ?? -1) - (a.stats[period].hitRate ?? -1)).slice(0,5)`
- [ ] 7.5 Signal Quality tab: same filter, sort by `sqr` desc
- [ ] 7.6 Each row shows primary metric large + secondary metric small (Accuracy: hitRate large, `SQR 0.8` small; Signal: sqr large, `67%` small)
- [ ] 7.7 Empty state when filtered list is empty: localized "Gathering more samples…" message
- [ ] 7.8 Unit test: leaderboard filters out insufficient-data entries, sorts correctly on both tabs

## 8. Stock Detail Page

- [ ] 8.1 Update `src/app/(app)/stocks/[ticker]/page.tsx`: import and call `useStockWinRate(decodedTicker)`
- [ ] 8.2 Add a new card above the existing return-rate stats section with layout mirroring the KOL scorecard: ring + counts + ⓘ popover + `<PeriodSelector>` + `<InsufficientDataBadge>`
- [ ] 8.3 Card header: localized "KOL community accuracy on {ticker}" / `KOL 社群對 {ticker} 的預測準確度`
- [ ] 8.4 Handle loading state (skeleton ring) and error state (show error card, don't break the page)

## 9. Settings Page — Default Period

- [ ] 9.1 Update `src/app/(app)/settings/page.tsx`: add state + `<Select>` for `defaultWinRatePeriod` under the Profile card, below Color Palette
- [ ] 9.2 Initialize from `profile.defaultWinRatePeriod`; include in the `handleSave` mutation payload
- [ ] 9.3 Options: `5d / 30d / 90d / 365d` with localized labels

## 10. i18n

- [ ] 10.1 Add keys to `src/messages/zh-TW/kols.json` and `src/messages/en/kols.json`:
  - `detail.scorecard.hitRate` (`精準度` / `Hit Rate`)
  - `detail.scorecard.precision`, `.sqr`, `.sqrExcellent`, `.sqrDecent`, `.sqrUnstable`
  - `detail.scorecard.avgExcessWin`, `.avgExcessLose`, `.threshold`
  - `detail.scorecard.insufficientData`, `.metricsDetails`
- [ ] 10.2 Add keys to `src/messages/{zh-TW,en}/dashboard.json`:
  - `leaderboard.tabs.accuracy` (`精準度` / `Accuracy`)
  - `leaderboard.tabs.signalQuality` (`信號品質` / `Signal Quality`)
  - `leaderboard.insufficientDataEmpty`
  - `pulse.sqr`
- [ ] 10.3 Add keys to `src/messages/{zh-TW,en}/stocks.json`:
  - `detail.communityAccuracy.title`
- [ ] 10.4 Add keys to `src/messages/{zh-TW,en}/settings.json`:
  - `profile.defaultPeriod.label`, `.description`
- [ ] 10.5 Add keys to `src/messages/{zh-TW,en}/common.json`:
  - `period.5d`, `.30d`, `.90d`, `.365d`

## 11. Docs + Validation

- [ ] 11.1 Update `docs/INVARIANTS.md` W1: `hitRate` is the UI primary; `winRate` alias removed; SQR qualitative thresholds
- [ ] 11.2 Update `openspec/specs/win-rate-classification/spec.md`: remove `winRate` alias requirement
- [ ] 11.3 Check off the "follow-up UI work" item in `docs/BACKLOG.md` (or add + check if it wasn't filed)
- [ ] 11.4 `npm run type-check && npm run lint && npm test` all green
- [ ] 11.5 Manual QA on seeded data: verify scorecard, dashboard pulse, dashboard leaderboard (both tabs), stock detail page, settings default period save + propagate
- [ ] 11.6 E2E smoke: `npm run test:e2e` on the affected routes
- [ ] 11.7 Ready for archive: `/opsx:archive kol-performance-metrics-ui` once merged
