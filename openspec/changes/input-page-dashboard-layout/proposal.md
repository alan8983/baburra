## Why

The unified `/input` page currently renders as a single column (smart input card + recent jobs below). Per user wireframe, the page should act as a lightweight dashboard: smart input + previous tasks on the left, and a right rail surfacing quick entry points into the rest of the app (Dashboard, KOLs, Stocks) with the 3 most recently added KOLs/stocks as one-click shortcuts. This makes `/input` a natural landing hub rather than a single-purpose form.

## What Changes

- Convert `src/app/(app)/input/page.tsx` to a two-column layout at `lg` breakpoint and above (≈2/3 main, ≈1/3 right rail). Collapse to single column below `lg`; right rail stacks below main column.
- Main column retains the existing smart-input card and `<RecentScrapeJobs />`.
- Add a new `<InputPageQuickNav />` component rendering 3 stacked cards in the right rail:
  1. Dashboard card — descriptive text, whole card navigates to `/dashboard`.
  2. KOLs card — descriptive text + 3 chips of the most recently added KOLs (order `created_at desc`). Chips link to `/kols/[id]`. Card header links to `/kols`.
  3. Stocks card — descriptive text + 3 chips of the most recently added stocks (order `created_at desc`). Chips link to `/stocks/[id]`. Card header links to `/stocks`.
- Reuse existing `useKols` / `useStocks` hooks. Sort client-side and slice top 3 if the hooks don't already expose a `recent` option.
- Add i18n keys under `input.quickNav.*` in `en` and `zh-TW`.

Out of scope:
- Wizard / detection / scrape flow changes
- E2E test updates (deferred)
- `/scrape` redirect or sidebar nav changes

## Capabilities

### New Capabilities

(none — no new backend capability)

### Modified Capabilities

(none — this is a UI layout change; no spec-level behavior changes to data-models, api-contracts, or ai-pipeline)

## Impact

- **Code**: `src/app/(app)/input/page.tsx`, new `src/components/input/input-page-quick-nav.tsx`, `src/messages/{en,zh-TW}/input.json`.
- **Data**: Reuses `useKols` and `useStocks`. No new API routes, no DB changes.
- **Tests**: New unit test for `InputPageQuickNav` (renders cards, slices top 3, hides gracefully when empty). E2E updates deferred to a follow-up change.
- **Responsive**: `lg` breakpoint split; single column below.
