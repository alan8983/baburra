## Tasks

### 1. Extract `KolStockSection` into its own file

- [x] 1.1 Create `src/app/(app)/kols/[id]/_components/kol-stock-section.tsx` and move the `KolStockSection` component (currently defined inline in `src/app/(app)/kols/[id]/page.tsx` lines ~132–381) into it. Also move the local helpers it depends on: `bucketToStockPeriodStats` and any `StockGroup`/`StockPost` types it uses. Export them too if the KOL page still needs them.
- [x] 1.2 Update `src/app/(app)/kols/[id]/page.tsx` to import `KolStockSection` from the new file; delete the inline definition.
- [x] 1.3 `npm run type-check` — pass (this step is a pure code move, no behavioral change expected).

### 2. Add `showAllPosts` prop to `KolStockSection`

- [x] 2.1 Extend the props interface with `showAllPosts?: boolean` (default `false`). Document the default inline.
- [x] 2.2 Inside the component, compute:
  ```ts
  const visiblePosts = showAllPosts || stock.posts.length <= 3 ? stock.posts : stock.posts.slice(0, 3);
  const showMoreButton = !showAllPosts && stock.posts.length > 3;
  ```
- [x] 2.3 Replace `{stock.posts.map(...)}` with `{visiblePosts.map(...)}`.
- [x] 2.4 Under the mapped post list, when `showMoreButton` is true, render a `<Button asChild variant="ghost" className="mt-2 w-full justify-center">` wrapping a `<Link href={ROUTES.KOL_STOCK_DETAIL(kolId, stock.ticker)}>{t('detail.postsByStock.showMore', { count: stock.posts.length })}</Link>`.
- [x] 2.5 Ensure no layout regression for `stock.posts.length <= 3` — the button block must not render an empty `<div>` or equivalent whitespace.

### 3. Route constants

- [x] 3.1 Add `KOL_STOCK_DETAIL: (kolId: string, ticker: string) => \`/kols/${kolId}/stocks/${encodeURIComponent(ticker)}\`` to `ROUTES` in `src/lib/constants/routes.ts`.
- [x] 3.2 Search the codebase for any ad-hoc `` `/kols/${id}/stocks/...` `` string templates and replace with the constant (should be none — this is a net-new pattern).

### 4. i18n keys

- [x] 4.1 Add `detail.postsByStock.showMore` under `kols` namespace in `src/messages/zh-TW/kols.json`. Value: `查看全部 {count} 篇文章`.
- [x] 4.2 Add the matching key in `src/messages/en/kols.json`. Value: `View all {count} posts`.
- [x] 4.3 Add `detail.postsByStock.backToKol` → zh-TW: `返回 {name}`, en: `Back to {name}` (used by the back link on the new page).
- [x] 4.4 Add `detail.postsByStock.empty` → zh-TW: `{kolName} 尚未發表關於 {ticker} 的文章`, en: `{kolName} hasn't posted about {ticker} yet.` (empty state when the pair has no posts).

### 5. New `/kols/[id]/stocks/[ticker]` route

- [x] 5.1 Create `src/app/(app)/kols/[id]/stocks/[ticker]/page.tsx`.
- [x] 5.2 Page contract:
  - Reads `{ id, ticker }` from async `params` (Next.js 16 pattern).
  - Calls `useKol(id)`, `useKolPosts(id)` — same hooks the parent page uses, so the cache is warm after navigation.
  - Re-runs the `postsByStock` group-by logic from the parent page (copy-paste is fine — this is a parallel consumer; do NOT lift into a shared hook unless a third caller appears). Pick the single `StockGroup` whose `ticker === decodeURIComponent(ticker)`.
  - Renders:
    - A back link to `ROUTES.KOL_DETAIL(id)` labeled via `t('detail.postsByStock.backToKol', { name: kol.name })`.
    - The compact KOL identity row (avatar + name).
    - The stock header (ticker + name with link to `ROUTES.STOCK_DETAIL(ticker)`).
    - `<KolStockSection stock={stockGroup} kolId={id} showAllPosts />`.
- [x] 5.3 Loading state: while `kol === undefined || postsData === undefined`, render the existing page skeleton style (match `KolDetailPage`'s loader — spinner or skeleton cards).
- [x] 5.4 Not-found / empty states per design §D5:
  - Unknown KOL → return the same 404 rendering as `KolDetailPage` (reuse the component or its pattern).
  - Valid KOL but no posts for this ticker → render the KOL header + a `<Card>` with `t('detail.postsByStock.empty', { kolName: kol.name, ticker })` and a back button. No spinner, no scorecard section (nothing to score).

### 6. Wire the button up

- [x] 6.1 Ensure `KolStockSection` imports `ROUTES` and the `Link` from `next/link`.
- [x] 6.2 Confirm the `<Link>` prefetches on hover (default behavior; no `prefetch={false}`).
- [x] 6.3 Sanity-check: clicking the button on the KOL page navigates to the new route with the correct ticker segment; browser Back returns to the KOL page with scroll position preserved (Next.js default).

### 7. Unit tests

- [x] 7.1 Create `src/app/(app)/kols/[id]/_components/__tests__/kol-stock-section.test.tsx`.
- [x] 7.2 Cases to cover:
  - Renders all posts and no "Show more" button when `stock.posts.length === 3`.
  - Renders all posts and no "Show more" button when `stock.posts.length < 3` (e.g. 1 and 2).
  - Renders exactly 3 posts + a "Show more" button when `stock.posts.length === 4`.
  - Renders exactly 3 posts + button when `stock.posts.length === 40`.
  - When `showAllPosts` is `true`, renders all posts and NO button regardless of count.
  - Asserts the 3 rendered posts are the first 3 in `stock.posts` order (the DESC-by-`postedAt` guarantee is upstream; this test just verifies the slice preserves input order).
  - Button's href resolves to `ROUTES.KOL_STOCK_DETAIL(kolId, ticker)` and contains a URL-encoded ticker for special cases (test with `BRK.B` and `^TWII`).
- [x] 7.3 Mock `useKolWinRate`, `useStockPricesForChart`, `useUnlockChecks`, `useProfile`, and `useRouter` — only the posts-list behavior is under test here.

### 8. Verify

- [x] 8.1 `npm run type-check` — pass.
- [x] 8.2 `npm run lint` — pass (18 pre-existing warnings, 0 errors).
- [x] 8.3 `npm test` — 920 tests pass (9 new + 911 pre-existing), no regressions.
- [x] 8.4 `npm run build` — `/kols/[id]/stocks/[ticker]` confirmed in build output.
- [ ] 8.5 Browser MCP validation per `validation.md`.

### 9. Docs

- [x] 9.1 No `docs/WEB_DEV_PLAN.md` phase change — this is inside an already-shipped phase.
- [x] 9.2 No `openspec/specs/` update — no spec capability is changed enough to warrant a living-spec update (pure UI routing addition).
