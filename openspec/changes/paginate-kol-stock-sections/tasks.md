## 1. i18n keys

- [x] 1.1 Add `kols.detail.pagination.previous`, `kols.detail.pagination.next`, and `kols.detail.pagination.pageLabel` to `src/messages/zh-TW/kols.json`
- [x] 1.2 Add the same three keys to `src/messages/en/kols.json` with English copy

## 2. Pagination control

- [x] 2.1 Create `src/app/(app)/kols/[id]/_components/page-pagination.tsx` exporting a `PagePagination` component with props `{ totalPages: number; currentPage: number; onPageChange: (page: number) => void }`
- [x] 2.2 Implement windowed page list: always show page 1 and `totalPages`; show pages within ±1 of current; collapse gaps with `…` (rendered as a non-clickable span)
- [x] 2.3 Render Prev / Next buttons; disable Prev when `currentPage === 1`; disable Next when `currentPage === totalPages`
- [x] 2.4 Use the shadcn `<Button>` (`variant="ghost"` for inactive pages, `variant="default"` or `variant="outline"` for the active page) and Lucide `ChevronLeft` / `ChevronRight` icons; wire ARIA labels to the i18n keys from §1
- [x] 2.5 Render nothing when `totalPages <= 1`

## 3. Page-level wiring (`page.tsx`)

- [x] 3.1 Extend the existing `postsByStock` `useMemo` in `src/app/(app)/kols/[id]/page.tsx` to sort the array by `posts.length` desc with ticker asc as tie-breaker
- [x] 3.2 Add a `currentPage` `useState<number>(1)` and a `useEffect` that resets it to `1` when the route param `id` changes
- [x] 3.3 Compute `totalPages = Math.max(1, Math.ceil(postsByStock.length / 10))` and slice the visible window (`postsByStock.slice((currentPage - 1) * 10, currentPage * 10)`) for rendering
- [x] 3.4 Render `<PagePagination />` below the per-stock list (only when `totalPages > 1`); wire `onPageChange` to `setCurrentPage`
- [x] 3.5 Tighten the inter-section `<Separator className="my-8" />` spacing (e.g. `my-5`) to match the new thin layout

## 4. Thin per-stock layout (`kol-stock-section.tsx`)

- [x] 4.1 In `src/app/(app)/kols/[id]/_components/kol-stock-section.tsx`, branch the render on `showAllPosts`: leave the existing 2-column block intact for `showAllPosts === true`
- [x] 4.2 For the default branch (`showAllPosts === false`), render: header line (ticker link, em-dash, stock name, count badge right-aligned) — full-width `<SentimentLineChart height={140} />` — inline 4-period stats strip
- [x] 4.3 Drop the inner `<Card>` wrappers in the thin branch; use a thin border / muted background only for the chart container if visually needed
- [x] 4.4 Render the inline stats strip as a flex row containing 5d / 30d / 90d / 365d values (use `formatReturnRate` and `getReturnRateColorClass` from `@/domain/calculators`); push the 30d W/L/N summary to the right when present
- [x] 4.5 Preserve the chart loading skeleton (140 px tall) and the "no price data" empty state in the thin branch
- [x] 4.6 Ensure marker click still routes to `ROUTES.POST_DETAIL(postId)` (unchanged from current behavior)
- [x] 4.7 Leave the Layer-2 locked-state branch (compact header + `UnlockCta`) unchanged

## 5. Tests

- [x] 5.1 Update `src/app/(app)/kols/[id]/_components/__tests__/kol-stock-section.test.tsx`: replace the post-slice / "Show more" assertions for the default branch with assertions that the thin branch does NOT render any post-snippet element
- [x] 5.2 Add a test asserting the thin branch renders the ticker link, the count badge, and the 4 period labels (5d / 30d / 90d / 365d)
- [x] 5.3 Keep the existing `showAllPosts === true` test ensuring all posts and the 2-column layout still render
- [x] 5.4 Add a unit test for `PagePagination` covering: hidden when `totalPages <= 1`, ellipsis appears when current page is far from boundaries, Prev/Next disabled at page 1 / page N, clicking a page number invokes `onPageChange`

## 6. Validation

- [x] 6.1 Run `npm run type-check`
- [x] 6.2 Run `npm run lint`
- [x] 6.3 Run `npm test` and confirm the updated `kol-stock-section.test.tsx` and new `page-pagination.test.tsx` pass
- [x] 6.4 Start the preview dev server and verify on a high-volume KOL (e.g. Gooaye) that page 1 renders 10 sections sorted by post count desc, pagination navigates correctly, and `/kols/[id]/stocks/[ticker]` is unchanged

## 7. Follow-up

- [x] 7.1 Open a GitHub issue titled "KOL detail: add sort/search controls for per-stock list" capturing the deferred UX (sort by recency / return rate; ticker search) so it is not lost — filed as [baburra#97](https://github.com/alan8983/baburra/issues/97)
