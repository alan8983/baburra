## Context

The KOL detail page (`src/app/(app)/kols/[id]/page.tsx`) groups posts by stock client-side from the `useKolPosts(id)` payload (already cached by React Query) and renders one `<KolStockSection>` per stock — currently in input order, with no upper bound. For a KOL like Gooaye (~138 posts across many tickers), every section mounts a `SentimentLineChart` (lazy-loaded but still costly), a return-rate stats card, and a posts list with up to 3 entries plus a "show more" button.

Two problems compound:
1. **Volume:** unbounded section count → long page, lots of charts mounting on first render.
2. **Density:** each section is a heavy 2-column grid with nested `<Card>` wrappers, so even a moderate KOL feels visually noisy. The chart's clickable markers already provide post-level navigation, making the right-column posts list redundant on the *list* view (it remains essential on the dedicated drill-down view).

The data layer needs no change: `useKolPosts` returns the full set, and the per-(KOL, stock) win-rate buckets are already on the cached `useKolWinRate` response. This change is purely presentational.

## Goals / Non-Goals

**Goals:**
- Cap rendered stock sections at 10 per page on the KOL detail view, with a `< 1 2 3 … >` control so users can navigate through additional pages.
- Surface the most-discussed stocks first by sorting per-stock sections descending by post count.
- Reduce per-stock vertical footprint and visual weight by adopting a single-column thin row (full-width chart + inline 4-period stats strip) and dropping the right-column posts list.
- Preserve the existing rich layout (chart, return-rate card, full posts list) on the KOL × stock drill-down route, which remains the canonical "all posts for this stock" view.

**Non-Goals:**
- Server-side pagination, virtualization, or any change to `useKolPosts` / `kolKeys`. The full payload is already loaded; we only slice for display.
- Sort / search / filter controls on the per-stock list (UI affordances). Tracked as a follow-up GitHub issue.
- Changes to the Layer-2 paywall behavior. Locked rows continue to render the existing `UnlockCta`. (Visual reconciliation between thin unlocked rows and the taller locked CTA is acknowledged and deferred.)
- Persisting the active page in the URL or session state. Resetting to page 1 on KOL change is acceptable.

## Decisions

### D1. Client-side sort + slice in `page.tsx` (no API change)
The `postsByStock` `useMemo` in `page.tsx` already groups posts by stock. We extend the same memo to:
1. Sort by `posts.length` desc, ticker asc as tie-breaker (deterministic ordering for stocks with equal counts).
2. Compute `totalPages = ceil(stocks.length / 10)`.
3. Slice the visible page in render.

**Why not server-side?** The full post list is already fetched and grouped client-side for the scorecard (`allStockPosts`); adding server pagination would require a new API surface and a second cache key for marginal gain. We are bounded by the size of `posts.length`, which is already loaded.

### D2. Page state lives in `useState` in `page.tsx`, resets on KOL change
A `useState<number>(1)` cursor is sufficient. We use the route param `id` as a `useEffect` dependency to reset the cursor to 1 if the user navigates between KOLs without unmounting the page (Next.js App Router can route-update without full remount). No URL persistence — page state is ephemeral session UX.

### D3. Branch `KolStockSection` layout on `showAllPosts`
The same component is reused on both the list page (default, `showAllPosts={false}`) and the drill-down page (`showAllPosts={true}`).

- `showAllPosts === false` → **new thin layout** (Option B): header line + full-width 140px sentiment chart + inline 4-period return-rate strip + 30d hit-rate summary. **No posts list.** No nested `<Card>` chrome.
- `showAllPosts === true` → **existing 2-column layout preserved unchanged** (chart card + return-rate card on left; posts list on right with all posts rendered).

This keeps the drill-down behavior identical and avoids touching its tests/specs. The existing `useStockPricesForChart`, `useKolWinRate`, `useUnlockChecks` hooks are reused as-is.

**Alternative considered:** split into two components (`KolStockSummary` and `KolStockFull`). Rejected — they share ~80% of the data wiring and Layer-2 gate; one component with a layout branch is simpler and the test surface stays in one place.

### D4. Pagination control: `< 1 2 3 … >` with ellipsis windowing
Rendered below the per-stock list, hidden when `totalPages <= 1`. Window logic:
- Always show first and last page.
- Show current ± 1.
- Insert `…` (non-clickable) when there is a gap.
- Prev/Next disabled at boundaries.

Implemented as a small local component (`_components/page-pagination.tsx`) co-located with the KOL detail page. **Not** extracted to `src/components/ui/` or `src/components/shared/` until a second consumer appears — per CLAUDE.md ("Don't add features … beyond what the task requires").

### D5. Layer-2 locked rows unchanged
The existing locked-state branch in `KolStockSection` (compact header + `UnlockCta`) is left intact. A locked row will visually be taller than thin unlocked rows on the same page; reconciling that lives in a future paywall-UX change.

### D6. Sentiment chart height
Default chart height drops from `200` to `140` in the new thin layout. Markers remain clickable; horizontal width grows (full-width vs ~half-column), so denser marker sets stay legible. The drill-down (`showAllPosts={true}`) keeps `200` for the rich view.

### D7. i18n
Add three keys under `kols.detail.pagination` in both `zh-TW` and `en`:
- `previous`, `next` — ARIA labels for prev/next buttons.
- `pageLabel` — ARIA label template, e.g. `"Page {page}"` / `"第 {page} 頁"`.

No new visible labels — page numbers render as numerals, ellipsis as `…`. The existing `postsByStock.total` count badge ("共 18 篇文章" / "Total 18 posts") moves verbatim into the new header line.

## Risks / Trade-offs

- **Lost post-snippet preview at a glance** → users on the list view no longer see the 5d/30d `PriceChangeBadge` row per individual post. **Mitigation:** the per-stock return-rate strip aggregates these across the stock; clicking any chart marker (or the ticker link) leads to per-post detail. The drill-down page retains per-post badges.
- **Locked vs unlocked row height mismatch on Layer-2-gated pages** → free users see a tall `UnlockCta` row interleaved with thin unlocked rows. **Mitigation:** explicitly out of scope; tracked for a paywall-UX follow-up. Acceptable because most production users in the target tier are not Layer-2 gated on most stocks.
- **Page state lost on tab/page reload** → users land on page 1 every visit. **Mitigation:** intentional simplicity. Search-param-backed page state can be added later if telemetry shows users deep-paginating.
- **Test churn** → existing tests in `kol-stock-section.test.tsx` assert the 3-post slice + "Show more" button visibility, which only describe the `showAllPosts={false}` (default) branch. Those assertions become invalid. **Mitigation:** rewrite the default-branch tests to cover the new thin layout (chart present, stats strip present, posts list absent) and keep / extend the `showAllPosts={true}` branch test.

## Migration Plan

Pure UI change, no data migration. Rollout: merge to `main`; manually verify on `/kols/<gooaye-id>` that (a) sections render in descending post count order, (b) page 1 shows 10 stocks, (c) pagination control navigates correctly, (d) the drill-down route at `/kols/<id>/stocks/<ticker>` is unchanged. No feature flag needed.

## Open Questions

None blocking. Two design knobs were closed by the user during scoping discussion:
- Layout direction → Option B (full-width chart + inline stats strip).
- Pagination style → `< 1 2 3 … >` (anticipating ≥10 pages for prolific KOLs in the future).
