## ADDED Requirements

### Requirement: Left column tabs replace single-card transcript

The Posts detail page (`/posts/[id]`) SHALL render the left column of its two-column body as a tab strip with three tabs in the order **Summary**, **Arguments**, **Full transcript**. The left column SHALL NOT render the post's transcript outside of the Full transcript tab.

#### Scenario: Default-active tab on load

- **WHEN** a user opens a Posts detail page for a post whose AI argument analysis has completed (`usePostArguments` resolves with at least one argument)
- **THEN** the Summary tab is active by default
- **AND** the Summary tab body renders without the user having to click anything

#### Scenario: Switching tabs preserves URL

- **WHEN** the user clicks the Arguments tab while viewing the Summary tab
- **THEN** the Arguments tab becomes active
- **AND** the page URL does not change (no query param, no hash)

#### Scenario: Argument cards no longer rendered as a separate section

- **WHEN** any Posts detail page renders
- **THEN** the page body does not contain the existing orphan `<BlurGate feature="argument_cards">` block below the two-column grid
- **AND** the only place argument cards render is inside the Arguments tab

### Requirement: Summary tab synthesizes from argument data

The Summary tab SHALL render a synthesized summary view derived at render time from the same argument data fetched by `usePostArguments`. No new API call, no new data field on the `posts` resource is required. For each ticker in the post, the Summary tab SHALL show the top three arguments ranked by `confidence` descending (with ties broken by statement type preference), each rendered as a bullet with a sentiment chip.

#### Scenario: Multi-ticker post with many arguments per ticker

- **WHEN** a post has two tickers, each with eight arguments
- **THEN** the Summary tab renders two ticker sections
- **AND** each ticker section contains exactly three bullets (the top three by confidence)

#### Scenario: Argument with summary field uses summary text

- **WHEN** an argument has a non-null `summary` field
- **THEN** the Summary tab bullet for that argument shows the `summary` text, not the verbatim `originalText`

#### Scenario: Argument with null summary field falls back to originalText

- **WHEN** an argument has a null `summary` field
- **THEN** the Summary tab bullet for that argument shows the `originalText` text

### Requirement: Argument-not-ready fallback

When `usePostArguments` resolves with an empty array (or fails with an error), the Posts detail page SHALL silently activate the Full transcript tab in place of the default Summary tab. The Summary and Arguments tab triggers SHALL remain visible in the tab strip but rendered as disabled (non-clickable visual treatment, with `aria-disabled="true"`).

#### Scenario: Post freshly scraped, AI not yet completed

- **WHEN** a user opens the Posts detail page for a post whose `usePostArguments` resolves to `[]`
- **THEN** the Full transcript tab is active by default
- **AND** the Summary and Arguments tab triggers are visible but disabled
- **AND** the disabled tab bodies (if forced active by direct interaction) render the inline hint `分析中...` (zh-TW) or `Analysis pending` (en)

#### Scenario: usePostArguments fails with an error

- **WHEN** `usePostArguments` errors out (network failure or 500 response)
- **THEN** the page falls through to the Full transcript tab using the same disabled-tab treatment as the empty-array case

#### Scenario: Loading state shows the default tab

- **WHEN** `usePostArguments` is still in its `isLoading` state on first render
- **THEN** the Summary tab remains the default-active tab
- **AND** the Summary tab body renders a loading skeleton until the request resolves

### Requirement: Free-tier paywall continues to apply inside Arguments tab

For free users without the `argument_cards` feature flag, the Arguments tab body SHALL be wrapped in the existing `<BlurGate feature="argument_cards">` component. The tab trigger itself SHALL NOT be disabled — free users can navigate to the tab and see the gate.

#### Scenario: Free user navigates to Arguments tab

- **WHEN** a free user (without `argument_cards` access) clicks the Arguments tab
- **THEN** the tab activates
- **AND** the tab body renders the same blurred preview + upgrade CTA that the orphan section rendered prior to this change

### Requirement: Right column chart-mode toggle on multi-stock posts

The Posts detail page SHALL render a chart-mode toggle (sub-tabs: K-line, Sentiment) at the top of the right column on posts with two or more stocks. The active mode controls which chart type is rendered for the per-stock loop. The toggle SHALL NOT render on posts with fewer than two stocks.

#### Scenario: Multi-stock post default state

- **WHEN** a post has three stocks and the user has no stored chart-mode preference
- **THEN** the toggle is visible at the top of the right column
- **AND** the K-line tab is active
- **AND** the right column renders three K-line cards stacked vertically (one per stock), with no Sentiment chart cards

#### Scenario: Toggling to Sentiment mode

- **WHEN** the user clicks the Sentiment tab on a three-stock post
- **THEN** the right column re-renders with three Sentiment chart cards stacked vertically (one per stock)
- **AND** no K-line cards are rendered

#### Scenario: Single-stock post hides the toggle

- **WHEN** a post has exactly one stock
- **THEN** the chart-mode toggle is not rendered
- **AND** the right column renders both a K-line card and a Sentiment chart card stacked vertically (the existing single-stock layout)

#### Scenario: Zero-stock post unchanged

- **WHEN** a post has no stocks
- **THEN** the chart-mode toggle is not rendered
- **AND** the right column renders the existing empty-state copy (`detail.noStocks`)

### Requirement: Chart-mode persistence per device

The user's chart-mode selection SHALL be persisted to `window.localStorage` under the key `posts.detail.chartMode` whenever the user clicks a tab. On subsequent navigations to any Posts detail page on the same device, the persisted mode SHALL be the initial-active mode.

#### Scenario: User selects Sentiment, navigates to a different post

- **WHEN** the user clicks the Sentiment tab on Post A, then navigates to Post B (also multi-stock)
- **THEN** Post B opens with the Sentiment tab active
- **AND** `localStorage.getItem('posts.detail.chartMode')` returns `'sentiment'`

#### Scenario: First-time visitor with no localStorage value

- **WHEN** a user with no `posts.detail.chartMode` localStorage entry opens any multi-stock post
- **THEN** the K-line tab is active by default

#### Scenario: localStorage write throws (private browsing)

- **WHEN** the user clicks a chart-mode tab in a context where `localStorage.setItem` throws (e.g., Safari private mode with quota exceeded)
- **THEN** the in-memory tab state still updates and the chart re-renders
- **AND** no visible error is shown to the user
- **AND** persistence is silently lost for the session

#### Scenario: localStorage value is unrecognised

- **WHEN** `localStorage.getItem('posts.detail.chartMode')` returns a string other than `'kline'` or `'sentiment'` (e.g. residue from a future version)
- **THEN** the page treats the value as missing and uses the default (`'kline'`)
