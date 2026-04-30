## 1. Chart-mode preference hook

- [ ] 1.1 Create `src/hooks/use-chart-mode-preference.ts` exporting `useChartModePreference(): [ChartMode, (m: ChartMode) => void]` and the `ChartMode = 'kline' | 'sentiment'` type. Implementation per design D6: initial state `'kline'`, hydrate from `localStorage.getItem('posts.detail.chartMode')` in `useEffect`, validate that the stored value is `'kline'` or `'sentiment'` (default to `'kline'` otherwise), and wrap `localStorage.setItem` in try/catch so private-mode Safari does not crash.
- [ ] 1.2 Export `useChartModePreference` from `src/hooks/index.ts` so consumers can import from `@/hooks`.

## 2. Refactor: extract chart rendering into a child component

- [ ] 2.1 Create `src/app/(app)/posts/[id]/_components/post-chart-tabs.tsx`. Move the existing `PostChartTab` and `PostStockChart` definitions out of `src/app/(app)/posts/[id]/page.tsx` and into this new file. Export a default-named component `PostChartTabs` that takes the same props the inline `PostChartTab` takes today (`stocks`, `postedAt`, `sentiment`, `kolName`, `postId`).
- [ ] 2.2 Inside `PostChartTabs`, split the per-stock `PostStockChart` so that K-line rendering and Sentiment chart rendering live in two distinct sibling components: `PostStockKlineCard` and `PostStockSentimentCard`. Each owns its own `useStockPricesForChart`, `aggregateCandles`, and `aggregateVolumes` calls (matching today's per-stock data fetching). The composite `PostStockChart` is no longer needed.
- [ ] 2.3 Update `page.tsx` to import `PostChartTabs` from the new file and replace the inline render. Confirm the page renders identically to before — no toggle yet, just the structural extraction. Run `npm run dev` and visually verify in preview.

## 3. Right column: chart-mode toggle

- [ ] 3.1 In `PostChartTabs`, conditionally render a shadcn `<Tabs>` control at the top of the right column when `stocks.length >= 2`. Two `<TabsTrigger>`s with values `kline` and `sentiment`, labelled via i18n keys `posts.detail.chartMode.kline` and `posts.detail.chartMode.sentiment` respectively. Bind the active value to `useChartModePreference()`.
- [ ] 3.2 Render two `<TabsContent>` panels — one with a vertical stack of `<PostStockKlineCard>` per stock (no Sentiment cards), the other with a vertical stack of `<PostStockSentimentCard>` per stock (no K-line cards).
- [ ] 3.3 When `stocks.length === 1`, render `[PostStockKlineCard, PostStockSentimentCard]` for the single stock without the toggle wrapper. When `stocks.length === 0`, preserve today's `Card` empty state with copy `detail.noStocks`.
- [ ] 3.4 Verify in the preview tool: a multi-stock post toggles correctly between K-line and Sentiment views; the active tab persists across page reload (verify the `posts.detail.chartMode` key in DevTools Application → Local Storage); a single-stock post renders both charts stacked with no toggle UI; a zero-stock post renders the empty state.

## 4. Left column: Summary view

- [ ] 4.1 Create `src/app/(app)/posts/[id]/_components/post-summary.tsx`. Export `PostSummary` taking `argumentGroups: TickerArgumentGroup[]` (the same shape as the prop passed to `PostArguments`).
- [ ] 4.2 Implement the summary synthesis per design D3: for each ticker group, sort arguments by `confidence` descending (ties broken by `statementType`: `thesis` and `recommendation` rank above `evidence`, `caveat`, `other`), take the top 3, render as a vertical bullet list. Each bullet shows `arg.summary ?? arg.originalText` followed by a small sentiment chip using `colors.sentimentBadgeColors[arg.sentiment]`.
- [ ] 4.3 Render the per-ticker section heading as `${ticker} · ${name}` linked to the stock detail page (`ROUTES.STOCK_DETAIL(ticker)`), matching the existing per-stock badge style on the page header.
- [ ] 4.4 Empty-state inside the component: when `argumentGroups.length === 0`, render the inline hint `posts.detail.tabs.analysisPending` (`分析中...` / `Analysis pending`).

## 5. Left column: tab container

- [ ] 5.1 Create `src/app/(app)/posts/[id]/_components/post-content-tabs.tsx`. Export `PostContentTabs` taking the props needed by all three tab bodies: `content: string`, `images: string[]`, `argumentGroups: TickerArgumentGroup[]`, `argumentsLoading: boolean`, `argumentsError: boolean`.
- [ ] 5.2 Implement the tab strip per design D1 + D2: shadcn `<Tabs>` with three triggers in order (Summary, Arguments, Full transcript). Default-active value: `summary` when arguments are present, else `transcript`. When `argumentsLoading === false && (argumentGroups.length === 0 || argumentsError)` set the Summary and Arguments triggers to `disabled` and force the active value to `transcript`.
- [ ] 5.3 Summary tab body: render `<PostSummary argumentGroups={argumentGroups} />`. While `argumentsLoading === true`, show a small skeleton (a few greyed-out lines).
- [ ] 5.4 Arguments tab body: render `<BlurGate feature="argument_cards">` wrapping the existing per-ticker `<PostArguments tickerGroups={[group]} />` loop (one component instance per group, matching today's render pattern).
- [ ] 5.5 Full transcript tab body: render the existing transcript layout (the `prose` block of `<p>{line}</p>` elements split from `content` plus the `images` grid). Move the inner `<Card>` wrapper inside the tab body so the visual treatment matches today.

## 6. Wire the page

- [ ] 6.1 In `src/app/(app)/posts/[id]/page.tsx`, replace the left column's existing `<Card>` (the post-content + images block) with `<PostContentTabs ... />`. Pass `content`, `images`, `argumentGroups`, `argumentsLoading: usePostArguments(id).isLoading`, `argumentsError: !!usePostArguments(id).error` (avoid double-calling the hook by destructuring once).
- [ ] 6.2 Replace the right column's existing `<PostChartTab>` render with the refactored `<PostChartTabs ... />`. Verify props match.
- [ ] 6.3 Delete the existing orphan argument section at the bottom of the page (the `{argumentGroups.length > 0 && <BlurGate>...</BlurGate>}` block). The `<PostArguments>` import in `page.tsx` is no longer used and SHOULD also be removed; the import moves to `post-content-tabs.tsx`.
- [ ] 6.4 Remove `Image` and `Card`/`CardContent` imports from `page.tsx` if no longer used (they move to `post-content-tabs.tsx` for the transcript tab).

## 7. i18n

- [ ] 7.1 In `src/messages/zh-TW/posts.json`, add the following keys under `detail`:
  - `tabs.summary` → `總結`
  - `tabs.arguments` → `論點`
  - `tabs.transcript` → `全文逐字稿`
  - `tabs.analysisPending` → `分析中...`
  - `chartMode.kline` → `K 線`
  - `chartMode.sentiment` → `情緒線`
  - `summary.heading` → `重點摘要`
- [ ] 7.2 In `src/messages/en/posts.json`, add the same keys with English values:
  - `tabs.summary` → `Summary`
  - `tabs.arguments` → `Arguments`
  - `tabs.transcript` → `Full transcript`
  - `tabs.analysisPending` → `Analysis pending`
  - `chartMode.kline` → `K-line`
  - `chartMode.sentiment` → `Sentiment`
  - `summary.heading` → `Key takeaways`
- [ ] 7.3 Verify no key naming collides with existing entries in `posts.json` (run `npm run dev` and check for missing-translation console warnings on the post detail page).

## 8. Verification

- [ ] 8.1 `npm run type-check` clean.
- [ ] 8.2 `npm test` — all unit tests pass. No new tests required for this change (per design D9: thin composition components without internal logic mirror the precedent set by `redesign-scorecard-with-directional-ring-and-histogram`).
- [ ] 8.3 `npm run lint` clean.
- [ ] 8.4 `npm run build` succeeds.
- [ ] 8.5 Manual QA in the preview tool covering the four primary states:
  - **Multi-stock post with arguments**: open a Gooaye 股癌 podcast post (post count > 100, multi-ticker). Confirm Summary tab is default-active, Summary content renders bullet lists per ticker, Arguments tab shows the existing per-ticker cards inside a BlurGate (or unblocked for paid users), Full transcript tab shows the verbatim content. Toggle chart mode K-line ⇄ Sentiment, verify only the active type renders.
  - **Single-stock post**: open a single-stock post. Confirm the right column shows both K-line and Sentiment cards stacked, no toggle UI.
  - **No-arguments post**: scrape a fresh post (or pick one whose AI run hasn't completed) and open its detail page. Confirm Summary and Arguments tabs are visibly disabled, Full transcript tab is auto-active, the disabled-tab bodies show `分析中...` if force-clicked.
  - **localStorage persistence**: toggle to Sentiment, navigate to another post, confirm Sentiment is still active. Open DevTools Application → Local Storage → confirm `posts.detail.chartMode === 'sentiment'`. Manually set the value to a junk string and reload — confirm the page falls back to `kline`.
- [ ] 8.6 Mobile/responsive QA (DevTools `iPhone 14`): the columns stack vertically (existing `lg:` breakpoint), the tabs and the chart-mode toggle remain functional, no horizontal scrollbar appears.
