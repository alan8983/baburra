## Why

The KOL detail page (`/kols/[id]`) renders one section per stock the KOL has discussed, all at once. For prolific KOLs (e.g., Gooaye with 138 posts spanning many tickers), the page becomes long and slow — every stock section mounts a sentiment line chart, a return-rate card, and a posts list. Users cannot quickly scan which stocks the KOL talks about most, and the dense per-stock chrome buries the chart, which is the primary navigation surface (clickable markers → post detail).

## What Changes

- Order per-stock sections **descending by post count** (tie-break by ticker, ascending) so the most-discussed stocks surface first.
- Paginate per-stock sections at **10 stocks per page** with a `< 1 2 3 … >` control rendered below the list.
- **BREAKING (UI):** redesign each per-stock section on the KOL detail page from a 2-column grid (chart + return-rate card on the left, posts list on the right) to a thin single-column row: full-width sentiment line chart at 140px tall, with an inline 4-period return-rate strip and 30d hit-rate summary below. Drop the right-column posts list — chart markers already navigate to post detail.
- Drop the inner `<Card>` wrappers from the per-stock thin layout to reduce visual weight.
- The KOL × stock drill-down page (`/kols/[id]/stocks/[ticker]`) keeps the existing 2-column layout including the posts list (it is the dedicated "all posts for this stock" view).
- Layer-2 paywall behavior is **unchanged** in this change — locked rows continue to render the existing `UnlockCta` block.

## Capabilities

### New Capabilities
- `kol-stock-list-presentation`: ordering, pagination, and per-stock layout for the per-stock sections shown on the KOL detail page.

### Modified Capabilities
<!-- None — no existing spec describes the KOL detail UI behavior. -->

## Impact

- **Code**:
  - `src/app/(app)/kols/[id]/page.tsx` — sort + paginate `postsByStock`; render pagination control.
  - `src/app/(app)/kols/[id]/_components/kol-stock-section.tsx` — thin Option B layout when `showAllPosts` is `false`; existing 2-column layout preserved when `showAllPosts` is `true`.
  - New: `src/app/(app)/kols/[id]/_components/page-pagination.tsx` (or inline) — `< 1 2 3 … >` control.
  - `src/app/(app)/kols/[id]/_components/__tests__/kol-stock-section.test.tsx` — update to cover the new thin layout (no posts list in default render) and keep coverage for the `showAllPosts` branch.
  - `src/messages/{zh-TW,en}/kols.json` — i18n keys for pagination ARIA labels (Previous, Next, page indicator).
- **No DB / API / migration changes.** Sort and pagination are purely client-side over the existing `useKolPosts` payload.
- **Drill-down route unaffected:** `/kols/[id]/stocks/[ticker]` continues to render the full posts list via `showAllPosts`.
- **Follow-up (out of scope, tracked separately):** sort/search controls on the KOL detail stock list — to be filed as a GitHub issue.
