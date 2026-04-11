## Why

`kol-overall-performance-metrics` landed a rich `PeriodMetrics` backend (`hitRate`, `precision`, `avgExcessWin`, `avgExcessLose`, `sqr`, `sufficientData`) across `GET /api/kols/[id]/win-rate`, `GET /api/stocks/[ticker]/win-rate`, and the dashboard endpoint — but **zero of those new fields reach the user**. All three UI consumers (`kol-scorecard`, `portfolio-pulse`, `kol-leaderboard`) still read the deprecated `winRate` alias (which equals `precision`, not `hitRate`), the stock detail page doesn't consume the win-rate API at all, and nothing surfaces `sufficientData` so the dashboard happily ranks a KOL with 2 wins / 1 loss as "67%". This is the follow-up UI migration that the parent change explicitly deferred.

Three concrete gaps to close:

1. **Wrong primary metric.** The ring shows `precision` under a "Win Rate" label. Under the new taxonomy, `hitRate` (wins / wins+noise+loses) is the honest number — a KOL whose posts land in the noise band half the time *should* see their ring shrink, not hide those posts entirely.
2. **Insights invisible.** SQR and σ-normalized excess returns are the whole reason the data layer was built — they distinguish "consistently good" KOLs from "loud but lucky" ones. Neither is rendered anywhere.
3. **No sample-size floor.** Low-resolved-post KOLs dominate rankings and inflate perceived accuracy. `sufficientData === false` is already in the payload but never checked.

Since Baburra hasn't launched, we can delete the `winRate` alias in the same pass rather than keeping it for backwards compatibility — one clean sweep instead of a two-phase deprecation.

## What Changes

### Data-layer cleanup (breaking, safe pre-launch)
- Remove the `winRate` deprecated alias from `WinRateBucket` in `src/domain/calculators/win-rate.calculator.ts` and update every call site (routes, hooks, components, tests). Consumers read `hitRate` / `precision` directly.
- No DB or API shape change beyond dropping the alias field from response bodies.

### Shared UI primitives (new)
- `<PeriodSelector>` — 4-tab segmented control for `5d | 30d | 90d | 365d`. Local state only; reads default from user profile.
- `<PerformanceMetricsPopover>` — click-to-open popover showing `precision`, `sqr` (with qualitative label "excellent / decent / unstable"), `avgExcessWin`, `avgExcessLose`, and the resolved threshold. Triggered by an `ⓘ` icon.
- `<InsufficientDataBadge>` — small inline indicator (`需要更多樣本 / More data needed`) shown when `sufficientData === false`.
- `<WinRateRing>` (modify) — swap label from "Win Rate" to "Hit Rate" (localized `精準度 / Accuracy`), render `"—"` when `!sufficientData`.

### User preference: default period
- Add `default_win_rate_period` column to `profiles` table (TEXT, default `'30d'`, CHECK constraint on `5d|30d|90d|365d`).
- Extend `ProfileData` / `UpdateProfileInput` in `use-profile.ts`, the `/api/profile` route handler, and the profile repository.
- Settings page: new select field under the existing Profile card labeled "預設勝率期間 / Default performance period".
- All four consumer components initialize their local `<PeriodSelector>` from `useProfile()` data, falling back to `30d` if profile not loaded.

### KOL Scorecard (`src/app/(app)/kols/[id]/_components/kol-scorecard.tsx`)
- Ring binds to `hitRate` (not `winRate` alias).
- Local `<PeriodSelector>` above the ring; changes which period's bucket feeds the ring and counts.
- `ⓘ` icon next to the ring label opens `<PerformanceMetricsPopover>`.
- Show `<InsufficientDataBadge>` when selected period has `sufficientData === false`; ring renders `"—"` but raw counts (wins/noise/loses) still render below.

### Dashboard — Portfolio Pulse (`portfolio-pulse.tsx`)
- Local `<PeriodSelector>` in the card header.
- Big number binds to `hitRate`.
- Small SQR sub-label under the percentage (e.g., `SQR 0.82`) when available.
- `—` + insufficient-data note when floor not met.
- Requires the dashboard endpoint to return all four period buckets instead of only `day30` (see Impact).

### Dashboard — KOL Leaderboard (`kol-leaderboard.tsx`)
- **Two tabs**: `精準度 Accuracy` (sorted by `hitRate` desc) and `信號品質 Signal Quality` (sorted by `sqr` desc).
- Both tabs **filter out** entries where `sufficientData === false` — no more 2-sample 100% KOLs polluting the top of the board. When the filtered list is empty, show an explicit "not enough data yet" state.
- Local `<PeriodSelector>` in the card header, shared across both tabs.
- Each row shows the sort key prominently; the other metric appears as a secondary small-text hint (e.g., `Accuracy tab: "67%"` big with `"SQR 0.9"` small below).
- Requires the dashboard endpoint to return all four period buckets per KOL + expose `sqr` and `sufficientData` per bucket.

### Stock Detail Page (`src/app/(app)/stocks/[ticker]/page.tsx`)
- New win-rate card positioned **above the existing return-rate stats section**, mirroring the KOL scorecard layout: ring + counts + `ⓘ` popover + local `<PeriodSelector>` + `<InsufficientDataBadge>`.
- Wires up the existing `useStockWinRate(ticker)` hook (currently unused by the page).
- Header copy: "KOL 社群對 {ticker} 的預測準確度 / KOL community accuracy on {ticker}".

### i18n
- New translation keys in `src/messages/{zh-TW,en}/`:
  - `kols.detail.scorecard.hitRate`, `.precision`, `.sqr`, `.sqrExcellent`, `.sqrDecent`, `.sqrUnstable`, `.avgExcessWin`, `.avgExcessLose`, `.insufficientData`, `.metricsDetails`
  - `dashboard.leaderboard.tabs.accuracy` = `精準度` / `Accuracy`
  - `dashboard.leaderboard.tabs.signalQuality` = `信號品質` / `Signal Quality`
  - `dashboard.leaderboard.insufficientDataEmpty`
  - `settings.profile.defaultPeriod` (+ `.description`)
  - `common.period.5d`, `.30d`, `.90d`, `.365d`

## Capabilities

### Modified Capabilities
- **`win-rate-classification`** — the data-model half of the capability is unchanged, but we drop the `winRate` alias requirement added by `kol-overall-performance-metrics` (it was a temporary compatibility shim). The primary UI metric is now explicitly `hitRate`; `precision` is available via the details popover but not as an alias.

### New Capabilities
- None. This change is pure UI delivery on top of an existing contract.

## Impact

### Code modified
- `src/domain/calculators/win-rate.calculator.ts` — remove `winRate` alias from `WinRateBucket`, remove `@deprecated` TSDoc
- `src/domain/services/win-rate.service.ts` — stop populating `winRate` alias
- `src/app/api/kols/[id]/win-rate/route.ts` — response no longer includes `winRate`
- `src/app/api/stocks/[ticker]/win-rate/route.ts` — same
- `src/app/api/dashboard/route.ts` (or equivalent) — return **all four period buckets** for pulse + leaderboard (currently only `day30`); expose `hitRate`, `sqr`, `sufficientData`
- `src/hooks/use-dashboard.ts` — `KolWinRateEntry` now carries `WinRateStats` (not just a single bucket); `PortfolioPulseData` carries four periods
- `src/hooks/use-profile.ts` — `ProfileData` + `UpdateProfileInput` add `defaultWinRatePeriod`
- `src/hooks/use-kols.ts`, `src/hooks/use-stocks.ts` — consumer types drop `winRate` field
- `src/app/(app)/kols/[id]/_components/kol-scorecard.tsx` — migrate to hitRate + popover + period selector
- `src/app/(app)/kols/[id]/_components/win-rate-ring.tsx` — label prop accepts localized string, renders insufficient-data state
- `src/app/(app)/dashboard/_components/portfolio-pulse.tsx` — period selector, hitRate, SQR sub-label
- `src/app/(app)/dashboard/_components/kol-leaderboard.tsx` — two tabs, filter by `sufficientData`, period selector
- `src/app/(app)/stocks/[ticker]/page.tsx` — new win-rate card section using `useStockWinRate`
- `src/app/(app)/settings/page.tsx` — new default-period select
- `src/messages/zh-TW/*.json`, `src/messages/en/*.json` — i18n keys
- `src/infrastructure/repositories/profile.repository.ts` (and `database.types.ts` regen) — `default_win_rate_period` field

### Code added
- `src/components/shared/period-selector.tsx` — reusable segmented control
- `src/components/shared/performance-metrics-popover.tsx` — shared popover for KOL + stock + dashboard use
- `src/components/shared/insufficient-data-badge.tsx` — shared badge
- `supabase/migrations/NNN_add_profile_default_win_rate_period.sql` — new profile column
- Unit tests: `period-selector.test.tsx`, `performance-metrics-popover.test.tsx`, leaderboard filtering tests

### Database
- One additive migration: `ALTER TABLE profiles ADD COLUMN default_win_rate_period TEXT NOT NULL DEFAULT '30d' CHECK (default_win_rate_period IN ('5d','30d','90d','365d'));`
- Regenerate `src/infrastructure/supabase/database.types.ts`.

### Not in scope
- A global dashboard-wide period selector (explicitly chosen local-only; a user-profile default covers the "set once" use case).
- New leaderboard algorithms beyond hitRate/sqr sorts (no weighted composite score).
- Mobile-specific redesigns of the scorecard / dashboard cards (responsive polish only).
- The pie-chart visualization floated in the parent change's brief — deferred; the popover covers the same information need with less novelty cost.
- Per-stock or per-sector win-rate drill-down on the KOL scorecard (separate change).
- Reanalyzing historical data — this is purely a presentation change, the stored classifications don't move.

### Dependencies
- Builds on `kol-overall-performance-metrics` (landed).
- No new npm packages.
- Blocks the eventual removal of the `winRate` alias — by landing this change, the alias is *already* gone, so no follow-up cleanup is needed.

### Docs
- Update `docs/INVARIANTS.md` W1 to reflect that `hitRate` is the UI primary and `winRate` alias no longer exists.
- Update `openspec/specs/win-rate-classification/spec.md` to remove the alias requirement.
- Update `docs/BACKLOG.md` to check off the "follow-up UI work" item left by the parent change.
