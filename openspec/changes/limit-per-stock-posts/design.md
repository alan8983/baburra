## Context

`src/app/(app)/kols/[id]/page.tsx` currently defines `KolStockSection` inline (lines 132–381) and renders the per-stock posts list with an unbounded `stock.posts.map(...)` at lines 345–372. For a KOL like Gooaye (40 posts across ~20 stocks) the NVDA card alone produces 18 stacked post rows, pushing every other stock section below the fold and making the page feel like a feed rather than a dashboard.

The posts are already sorted DESC by `postedAt` upstream in `useKolPosts` (confirmed: `src/app/api/kols/[id]/posts/route.ts` returns `.order('posted_at', { ascending: false })`), so no client-side re-sort is needed — the first 3 are the most recent.

This change is UI-only. No API, no schema, no data migration.

## Goals / Non-Goals

**Goals:**
- Default KOL detail page shows at most 3 posts per stock.
- Users can reach every post for a given (KOL, stock) pair via a single click.
- New page is shareable, bookmarkable, and has a sensible browser back story.
- Zero new API surface. Reuse `useKolPosts` — its React Query cache is populated by the parent KOL page, so navigation into the detail page is instant.
- No regression for KOLs with ≤ 3 posts on any stock — no button, no layout shift.

**Non-Goals:**
- Pagination on the new detail page. Max observed posts per (KOL, stock) today is ~20; if any pair exceeds 100 in the future, a separate proposal adds pagination.
- Server-side filtering endpoint (`/api/kols/[id]/stocks/[ticker]/posts`). The parent page already fetches all posts; client-side filter by `stockId` is free.
- Rearranging the Stock detail page (`/stocks/[ticker]`). That surface already paginates posts independently and is out of scope.
- Inline expand/collapse. User preference (question 4) is redirect, not animation.
- State persistence across visits (user preference: reset on each visit — trivially satisfied by navigation).

## Decisions

### D1 — New route shape

**Decision:** `/kols/[id]/stocks/[ticker]`.

**Alternatives considered:**
- `/kols/[id]?stock=NVDA` (query param): breaks the "back button returns to KOL detail" story — it would return to the same URL with no param. Also awkward for sharing.
- `/stocks/[ticker]?kol=<id>`: puts the KOL page under the stock hierarchy, but the feature is "this KOL's posts about this stock" — KOL is the primary entity. Wrong parent.
- `/kols/[id]/stocks/[ticker]` (chosen): clean segment hierarchy, matches the mental model (drill-down from KOL → their NVDA posts), and keeps breadcrumbs natural: `KOLs / Gooaye / NVDA`.

**Why ticker, not stockId?**
- Stock routes elsewhere in the app (`/stocks/[ticker]`) already use ticker. Consistency wins.
- Tickers are user-readable in URLs; UUIDs aren't.
- Special cases (`^TWII`, `BRK.B`) need URL-encoding — handle with `encodeURIComponent` on the call site. Same pattern used by `ROUTES.STOCK_DETAIL`.

### D2 — Component structure

**Decision:** Extract `KolStockSection` into its own file at `src/app/(app)/kols/[id]/_components/kol-stock-section.tsx` and add a `showAllPosts?: boolean` prop (default `false`).

```
Before:
  src/app/(app)/kols/[id]/page.tsx
    ├── KolStockSection (inline, 250 lines)
    └── KolDetailPage

After:
  src/app/(app)/kols/[id]/
    ├── _components/
    │   ├── kol-scorecard.tsx     (unchanged)
    │   └── kol-stock-section.tsx (extracted, gains showAllPosts prop)
    ├── page.tsx                  (imports KolStockSection, passes showAllPosts={false})
    └── stocks/[ticker]/
        └── page.tsx              (imports KolStockSection, passes showAllPosts={true})
```

**Alternatives considered:**
- Duplicate the component: cheap short-term, but the two surfaces would drift — a fix to one wouldn't reach the other. Rejected.
- Split into `<StockSectionHeader>`, `<StockSectionChart>`, `<StockSectionPosts>` sub-components: more surgical, but over-engineered for a single new consumer. Rejected.
- Prop drilling `postLimit?: number`: flexible but invites misuse (random limits in other callers). A boolean pins the two states we actually support. Chosen.

**Prop contract:**
```ts
interface KolStockSectionProps {
  stock: StockGroup;
  kolId: string;
  /** When true, render every post; hide the "Show more" button. Default false. */
  showAllPosts?: boolean;
}
```

### D3 — The "Show more" button

**Decision:** Render under the post list when `stock.posts.length > 3`. Label: `"查看全部 {count} 篇文章"` (zh-TW) / `"View all {count} posts"` (en). Clicking navigates via Next.js `useRouter().push(ROUTES.KOL_STOCK_DETAIL(kolId, ticker))`.

**Why a button, not a link?**
- Visually: consistent with existing action affordances on the card.
- Accessibility: button semantics with `onClick={() => router.push(...)}` vs `<Link>` — either works. Using `<Link>` (default `next/link`) gives free prefetch on hover, which is desirable because the destination page shares the same `useKolPosts` data. **Final choice: `<Link>`**, styled as a button (shadcn `Button variant="ghost"` with `asChild`).

**Label & i18n:**

| Key | zh-TW | en |
|---|---|---|
| `kols.detail.postsByStock.showMore` | `查看全部 {count} 篇文章` | `View all {count} posts` |

**Threshold logic:**
```
if (stock.posts.length > 3) {
  visible = stock.posts.slice(0, 3)
  renderShowMoreButton = true
} else {
  visible = stock.posts
  renderShowMoreButton = false
}
```

### D4 — The new `/kols/[id]/stocks/[ticker]` page

**Decision:** Full-featured page (not bare list). Renders:

```
┌──────────────────────────────────────────────────────────┐
│ [← Back to Gooaye]                                       │  breadcrumb / back link
│                                                          │
│ ┌────┐ Gooaye 股癌                                       │  KOL header lite
│ └────┘ NVDA · Nvidia Corp. [→ stock detail]              │  stock header
│                                                          │
│ ┌─ Sentiment chart ──────────────────────────────────┐   │
│ │ (same chart as parent page, full width)           │   │
│ └───────────────────────────────────────────────────┘   │
│                                                          │
│ ┌─ Return rate & win rate ──────────────────────────┐   │
│ │ 5d / 30d / 90d / 365d tiles + per-stock 30d ring  │   │
│ └───────────────────────────────────────────────────┘   │
│                                                          │
│ All posts (40)                                           │
│ ┌─ Post 1 ─────────────────────────────────────────┐    │
│ ├─ Post 2 ─────────────────────────────────────────┤    │
│ ├─ ... ───────────────────────────────────────────┤     │
│ └─ Post N ─────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

**Data loading:**
```tsx
export default function KolStockDetailPage({ params }: { params: Promise<{ id: string; ticker: string }> }) {
  const { id, ticker } = use(params);
  const { data: kol } = useKol(id);
  const { data: postsData } = useKolPosts(id);  // ← reuses parent page's cache

  // Client-side filter: find the single StockGroup for this ticker
  const stockGroup = useMemo(() => {
    // Same groupBy logic as parent page, then pick by ticker
    ...
  }, [postsData?.data, ticker]);

  if (!kol || !stockGroup) return <NotFound />;

  return (
    <div>
      <BackLink href={ROUTES.KOL_DETAIL(id)} label={kol.name} />
      <KolStockSection stock={stockGroup} kolId={id} showAllPosts />
    </div>
  );
}
```

**Why `useKolPosts` and not a new endpoint?**
- The parent page already fetches all posts for this KOL and caches them for 5 min via React Query.
- When a user clicks `Show more`, the navigation is instant — the cache is warm.
- A new `/api/kols/[id]/stocks/[ticker]/posts` endpoint would be a server round-trip for data the client already has. Only justified if page size gets too large; not today.

**Layer-2 unlock gating:** The existing `KolStockSection` already handles L2 gating via `unlockChecks.hasLayer2(kolId, stockId)`. The new page inherits that logic for free — deep-linking to a locked (KOL, stock) pair shows the same `<UnlockCta>` that the inline card does.

### D5 — Not-found handling

Two error states to cover on the new page:

| Case | UX |
|---|---|
| KOL ID doesn't exist | 404 (reuse existing `KolDetailPage` not-found rendering pattern) |
| Ticker exists globally but the KOL has never posted about it | Render the KOL header + a small empty-state card: `"Gooaye hasn't posted about {ticker} yet."` + link back to KOL detail |

The second case is more likely (user bookmarks a URL; KOL later deletes their posts about that stock). Matching 404 would be too harsh.

### D6 — Sort confirmation & stability

`useKolPosts` returns `{ data: PostWithPriceChanges[] }` already sorted `posted_at DESC` from the API (verified in `src/app/api/kols/[id]/posts/route.ts`). The per-stock `StockGroup.posts` array in the existing `postsByStock` `useMemo` preserves that order because it pushes posts in iteration order. **No client-side sort needed — do not add one.** (Adding a redundant sort would just invite a bug if the API order ever drifts and the client sorts by a subtly different key.)

To guard against regression, the unit test for the slice logic asserts both the threshold AND the order of the 3 returned posts.

## Risks / Trade-offs

**Client-side filter staleness.** The new page reuses `useKolPosts` data. If the user lands on the new page via direct URL (no parent-page visit), `useKolPosts` has to fetch cold. This is the normal React Query cold-start behavior — the new page just needs a loading state while `postsData === undefined`. Not a risk, just a spec item in tasks.md.

**No pagination.** If a single (KOL, stock) pair ever has thousands of posts, the new page renders them all. Today's max is ~20. Accept this until it breaks; a follow-up proposal adds `limit/offset` or virtualization.

**`KolStockSection` prop creep.** Adding `showAllPosts` is the thin end of a wedge — future callers might want `showChart`, `showScorecard`, etc. Convention: keep this prop bounded to the post-list behavior. If additional surfaces need different sub-assemblies, compose from the underlying primitives instead of growing the prop API.

**Locale key naming.** Placing `showMore` under `kols.detail.postsByStock.*` keeps it next to the existing `postsByStock.title` / `postsByStock.total` keys. Consistent with the file layout; no risk.

## Migration Plan

Pure additive UI change. No feature flag needed — the behavior is binary and low-risk (worst case is a broken link, instantly reverted). Ship it, verify in prod, move on.

## Open Questions

None blocking implementation. Deferred items:
- **Is the new page's URL pattern worth generalizing?** If we later add "posts by this KOL about this argument category" or similar, we might want a more flexible scheme. Revisit when a second drill-down appears; don't pre-abstract.
