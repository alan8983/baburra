## ADDED Requirements

### Requirement: Stocks ordered by post count descending

The KOL detail page SHALL render per-stock sections sorted by the number of posts the KOL has published about each stock, in descending order. Stocks with equal post counts SHALL be ordered alphabetically by ticker (ascending) so the order is deterministic.

#### Scenario: KOL with stocks of unequal post counts

- **WHEN** a KOL has posted 18 times about NVDA, 5 times about AAPL, and 12 times about TSLA
- **THEN** the per-stock sections render in the order NVDA → TSLA → AAPL on the KOL detail page

#### Scenario: Tie-breaking by ticker

- **WHEN** a KOL has posted 4 times each about MSFT and GOOGL
- **THEN** the GOOGL section renders before the MSFT section

### Requirement: Per-stock sections paginated at 10 per page

The KOL detail page SHALL render at most 10 per-stock sections at any time. When the KOL has more than 10 stocks, the page SHALL render a pagination control below the list that allows navigating to additional pages of 10 stocks each.

#### Scenario: KOL with fewer than 10 stocks

- **WHEN** a KOL has posted about 7 distinct stocks
- **THEN** all 7 per-stock sections are rendered and no pagination control is shown

#### Scenario: KOL with more than 10 stocks

- **WHEN** a KOL has posted about 23 distinct stocks
- **THEN** the first page renders 10 sections (the 10 with the highest post counts) and a pagination control is rendered with links to pages 1, 2, 3 and Prev/Next buttons

#### Scenario: Navigating to a later page

- **WHEN** a KOL has 23 distinct stocks and the user clicks page 3 in the pagination control
- **THEN** the per-stock list re-renders with stocks 21–23 (the 3rd page of 10) and the pagination control reflects page 3 as active

#### Scenario: Page resets when KOL changes

- **WHEN** the user is viewing page 2 of KOL A and navigates to KOL B without unmounting the page
- **THEN** the active page resets to 1 for KOL B

### Requirement: Pagination control uses windowed numeric style

The pagination control SHALL render numeric page links with ellipsis windowing in the style `< 1 2 3 … N >`. The first page, the last page, and pages within ±1 of the current page SHALL always be shown; gaps SHALL be collapsed into a non-clickable ellipsis. Prev and Next buttons SHALL be disabled at boundaries.

#### Scenario: Current page in the middle of many pages

- **WHEN** there are 12 pages and the user is on page 6
- **THEN** the control renders `< 1 … 5 6 7 … 12 >` with Prev and Next both enabled

#### Scenario: Current page is the first page

- **WHEN** the user is on page 1 of 5
- **THEN** the Prev button is disabled and the Next button is enabled

#### Scenario: Current page is the last page

- **WHEN** the user is on page 5 of 5
- **THEN** the Next button is disabled and the Prev button is enabled

### Requirement: Per-stock thin layout on the KOL detail page

On the KOL detail page (`/kols/[id]`), each per-stock section SHALL render a single-column thin layout consisting of: a header line with the ticker, stock name, and post count badge; a full-width sentiment line chart 140 pixels tall whose markers remain clickable to navigate to the corresponding post detail; and an inline horizontal strip below the chart showing the 5d / 30d / 90d / 365d average return rates and (when available) the 30d hit-rate summary. The section SHALL NOT render a posts list. The section SHALL NOT wrap chart or stats in nested `<Card>` elements.

#### Scenario: Stock with chart data and return-rate buckets available

- **WHEN** a stock section renders on the KOL detail page with available chart candles and a non-empty `bucketsByStock[stockId]`
- **THEN** the rendered DOM contains the ticker link, the stock name, a "共 N 篇文章" / "Total N posts" badge, a sentiment line chart 140 px tall with sentiment markers, and a stats strip showing 4 average return rates plus the 30d W/L/N summary
- **AND** no element rendering an individual post snippet is present

#### Scenario: Clicking a chart marker navigates to the post

- **WHEN** the user clicks a sentiment marker on the chart in a per-stock section
- **THEN** the user is navigated to that post's detail page

### Requirement: Drill-down view preserves rich layout

The KOL × stock drill-down route (`/kols/[id]/stocks/[ticker]`) SHALL continue to render the existing 2-column layout (chart card + return-rate card on the left, full posts list on the right) with all of the KOL's posts about that stock shown. This requirement is invariant to the new presentation rules above.

#### Scenario: Drill-down for a stock with 18 posts

- **WHEN** the user navigates to `/kols/<id>/stocks/<ticker>` for a stock the KOL has posted about 18 times
- **THEN** the page renders the chart card, the return-rate card, and a posts list containing all 18 posts (no truncation, no "show more" button)

### Requirement: Layer-2 paywall behavior unchanged

For free users on stocks gated behind the Layer-2 paywall, the locked-row rendering SHALL be unchanged: the section displays a compact ticker/name/count header and the existing `UnlockCta` block in place of the chart and stats. Sorting and pagination SHALL apply uniformly to locked and unlocked stocks based on post count.

#### Scenario: Free user with mixed locked and unlocked stocks

- **WHEN** a free user views a KOL detail page where some stocks are Layer-2-locked and the user has 12 stocks total
- **THEN** all 12 stocks participate in the post-count sort and the page-1 slice (10 stocks), with each locked stock rendering the existing compact header + `UnlockCta` and each unlocked stock rendering the new thin layout
