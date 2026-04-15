## Why

The KOL detail page (`/kols/[id]`) renders one card per stock, and each card shows every post that KOL has made about that stock. For prolific KOLs this is unscannable — Gooaye has 40+ posts and NVDA alone accumulates 18+ of them, turning a single stock card into a long vertical scroll that buries the sentiment chart, return-rate tiles, and every subsequent stock section. The user can't get a quick "what did this KOL say about NVDA" overview without scrolling past the raw post list.

Capping the default view to the 3 most recent posts per stock restores scannability. For users who want the full history, a dedicated per-(KOL, stock) detail page is a better home than an inline expand — it gives the view a shareable URL, a back-button story, and room to breathe.

## What Changes

- KOL detail page: the per-stock `Posts list` card renders at most 3 posts (DESC by `postedAt`). When the stock has more than 3 posts, a `Show more (N)` button appears under the list and navigates to a new route. When ≤ 3 posts, all are rendered and no button shows.
- New route: `/kols/[id]/stocks/[ticker]` — a dedicated page for (KOL, stock) pair. Renders the KOL header lite, the stock header (ticker + name), the same sentiment chart + return/win-rate cards that appear inline on the parent KOL page, and the **full** post list with no cap, DESC by `postedAt`.
- New client route constant: `ROUTES.KOL_STOCK_DETAIL(kolId, ticker)` in `src/lib/constants/routes.ts`.
- i18n: add `kols.detail.postsByStock.showMore` and related back-link / breadcrumb keys for zh-TW + en.
- `KolStockSection` component gains a `showAllPosts: boolean` prop (default `false`). KOL detail page passes `false`; new route passes `true`. No component duplication.

## Capabilities

### Modified Capabilities
- `kol-detail-page`: per-stock post list gains a 3-post cap with overflow redirect. No server contract change.
- `routing`: adds one new App Router segment under `/kols/[id]/stocks/[ticker]`.

## Impact

- DB: none.
- API: none. The new route filters the existing `useKolPosts(kolId)` response client-side by `stockId`; the cache is already populated by the parent page so cross-navigation is instant.
- Client: `src/app/(app)/kols/[id]/page.tsx` gets a small diff (slice + button). The `KolStockSection` component (defined inline in that file) gains a `showAllPosts` prop and is lifted out to its own file so the new route can import it without a circular dep. New page file at `src/app/(app)/kols/[id]/stocks/[ticker]/page.tsx`.
- i18n: 2 new keys × 2 locales = 4 entries.
- Scope: KOL detail surface only. The Stock detail page (`/stocks/[ticker]`) already paginates its own post list and is out of scope.
