## Why

The Posts detail page (`/posts/[id]`) currently renders the full transcript / post body as a single block in the left column of a two-column layout, while the right column iterates per-stock and stacks `[K-line, Sentiment]` cards in pairs. For a podcast post with a 5,000–15,000 word transcript and 2–4 ticker mentions, this produces:

- A left column that is 10–20× taller than the right column. The right-column charts dead-end well before the transcript ends, and the user perceives the entire page as "just a transcript."
- A right column whose chart order is `[Stock A K-line, Stock A Sentiment, Stock B K-line, Stock B Sentiment, ...]` — group-by-stock. Users who want to scan all sentiment markers at a glance, or compare K-lines across the post's stocks, must hop between non-adjacent cards.
- The AI-extracted argument cards — the actual analytical output of the product — live below the two-column grid, behind a `BlurGate`. New users routinely never scroll far enough to see them.

The page is the highest-value detail surface in the product (a backtest of one specific KOL claim) but its information architecture buries the analysis under raw source material.

## What Changes

- **Tabbed left column**: replace the single transcript card with a tab strip `[總結 (Summary) | 論點 (Arguments) | 全文逐字稿 (Full transcript)]`. Default-active tab is **Summary**.
  - **Summary** is a synthesized view of the existing Argument Analysis cards — top arguments by confidence/category weight, grouped by ticker. No new data model; no new API call.
  - **Arguments** is the existing argument-cards experience (currently rendered below the page) hoisted into the tab. The existing `BlurGate` for free users continues to apply *inside* the tab content.
  - **Full transcript** is today's transcript-as-paragraphs, scrollable inside the tab body. No internal "show more" — the tab itself is the disclosure.
- **Argument-not-ready fallback**: when `usePostArguments` returns an empty list (post freshly scraped, AI not done, or AI failed), Summary and Arguments tabs render a small `分析中...` hint and the active tab auto-falls-through to **Full transcript**. The tab strip remains visible so the user understands the analysis exists as a concept.
- **Promote analysis above transcript**: the Argument Analysis cards no longer render as a separate section below the two-column grid. They live exclusively inside the Arguments tab. The two-column grid becomes the page's primary content — no more orphan section below it.
- **Right-column chart-type toggle**: add a sub-tab control `[K-line | Sentiment]` at the top of the right column.
  - `[K-line]` renders one `CandlestickChart` per stock, stacked vertically. No sentiment chart.
  - `[Sentiment]` renders one `SentimentLineChart` per stock, stacked vertically. No K-line.
  - Each tab still iterates the post's stocks, but the loop is **inside** the tab — no more interleaving.
- **Default toggle state**: K-line. **Persisted per-user via `localStorage`** under a single key (`posts.detail.chartMode`). On reload, the user's last choice is restored.
- **Hide the toggle when `stocks.length < 2`**: a single-stock post renders both charts stacked exactly as today (no toggle UI). Toggle appears only when there are ≥ 2 stocks (it has no value when there is nothing to compare).

### Out of scope

- Adding a real `summary` column to the `posts` table or a new AI pipeline pass to generate dedicated summaries. Tracked separately in [#102](https://github.com/alan8983/baburra/issues/102) — for now Summary is derived at render time from existing argument data.
- Merging sentiment markers into the K-line (rejected during exploration: hard to read for users used to two-axis sentiment-vs-time framing).
- Per-stock sub-tabs (`[Stock A | Stock B | Stock C]`) inside the right column. The single chart-type toggle handles the use case adequately for the median 1–4 stock post.
- Visual regression testing infrastructure (Playwright snapshot comparisons, Storybook) for these layout changes. Verification is manual via the preview tool.
- Re-styling or redesigning the `VerdictHero`, the per-stock sentiment-and-price-change badges, the back/bookmark/delete header, the re-analyze banner, or the avatar/KOL strip. Those continue to render exactly as today.
- The Posts detail page on mobile gets the same tabs and toggle behaviour with no special collapse — the layout already stacks columns on `< lg`.

## Capabilities

### New Capabilities

- `posts-detail-presentation`: tab structure for the left column (Summary / Arguments / Full transcript), the chart-type toggle for the right column, default behaviours, persistence rules, and visibility thresholds. Documents the user-facing contract for the Posts detail page so future changes know which behaviours are intentional.

### Modified Capabilities

None. No existing spec describes the Posts detail page UI today.

## Impact

- **Code**:
  - `src/app/(app)/posts/[id]/page.tsx` — restructure the two-column grid: left column wraps in `Tabs` (shadcn/ui), right column wraps in a controlled chart-mode toggle. Argument section (`<BlurGate feature="argument_cards">...</BlurGate>` block at the bottom of the page) deletes — its content moves into the Arguments tab.
  - `src/app/(app)/posts/[id]/_components/post-content-tabs.tsx` (new) — the Summary / Arguments / Full-transcript tab container. Owns the active-tab state and the fallback-when-no-arguments logic.
  - `src/app/(app)/posts/[id]/_components/post-summary.tsx` (new) — synthesizes a Summary view from `argumentGroups` (top N arguments by confidence per ticker, grouped by ticker, rendered as a compact bullet list with sentiment chips).
  - `src/app/(app)/posts/[id]/_components/post-chart-tabs.tsx` (new) — the K-line / Sentiment toggle and conditional-render. Refactors `PostChartTab` and `PostStockChart` from `page.tsx`: K-line and Sentiment chart rendering split into two siblings instead of one composite per-stock card.
  - `src/hooks/use-chart-mode-preference.ts` (new) — `useChartModePreference()` reads/writes `posts.detail.chartMode` in `localStorage`, falls back to `'kline'`, returns `[mode, setMode]`. Co-locates the persistence concern; SSR-safe (returns default on first render, hydrates after mount).
  - `src/messages/{zh-TW,en}/posts.json` — new keys for tab labels (`detail.tabs.summary`, `detail.tabs.arguments`, `detail.tabs.transcript`), the `分析中...` hint, the chart-mode toggle labels (`detail.chartMode.kline`, `detail.chartMode.sentiment`), and the Summary block heading copy.
- **No DB / API / migration changes.** All changes are purely frontend composition over data already returned by `usePost`, `usePostArguments`, and `useStockPricesForChart`.
- **No backend behavior changes.** Bookmark, delete, re-analyze, and arguments fetching all continue exactly as today.
- **Tests**:
  - Existing tests under `src/**/__tests__/` should remain green — no domain or repository contracts change. Light component tests for the new tabs / toggle / preference hook are deferred (the components are thin composition over already-tested primitives, consistent with the project's existing testing investment level — see `redesign-scorecard-with-directional-ring-and-histogram` for precedent).
- **i18n**: ~7 new keys per locale; no renames to existing keys.
- **Bundle size**: no new heavy dependencies. shadcn `Tabs` is already in the project (used elsewhere). `localStorage` access is native.
